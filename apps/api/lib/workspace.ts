import type { Publisher } from '@orpc/publisher'
import { db } from '@tamery/db'
import { members, workspaces } from '@tamery/db/schema'
import { slugify } from '@tamery/shared/slugify'
import {
  EDITOR_ROLES,
  isDefaultWorkspaceMetadata,
  serializeWorkspaceMetadata,
} from '@tamery/shared/workspace'
import type { Column } from 'drizzle-orm'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const DEFAULT_WORKSPACE_NAME = 'Personal'

export const workspaceSlug = (name: string) => {
  const base = slugify(name) || 'workspace'

  return `${base}-${nanoid(8)}`
}

const userDefaultWorkspaceId = async (
  userId: string,
  executor: Pick<typeof db, 'select'> = db
) => {
  const rows = await executor
    .select({ id: workspaces.id, metadata: workspaces.metadata })
    .from(members)
    .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
    .where(eq(members.userId, userId))
    .orderBy(asc(members.createdAt))

  return (
    rows.find((row) => isDefaultWorkspaceMetadata(row.metadata))?.id ?? null
  )
}

export const ensureDefaultWorkspace = async (userId: string) => {
  const existingId = await userDefaultWorkspaceId(userId)

  if (existingId) {
    return existingId
  }

  return db.transaction(async (tx) => {
    // Re-checked under the lock: racing sign-in requests would each create a default workspace.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)

    const lockedId = await userDefaultWorkspaceId(userId, tx)

    if (lockedId) {
      return lockedId
    }

    const [workspace] = await tx
      .insert(workspaces)
      .values({
        metadata: serializeWorkspaceMetadata({ default: true }),
        name: DEFAULT_WORKSPACE_NAME,
        slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
      })
      .returning({ id: workspaces.id })

    if (!workspace) {
      throw new Error('Failed to create default workspace')
    }

    await tx.insert(members).values({
      role: 'owner',
      userId,
      workspaceId: workspace.id,
    })

    return workspace.id
  })
}

export const memberWorkspaces = (userId: string) =>
  db
    .select({ id: members.workspaceId })
    .from(members)
    .where(eq(members.userId, userId))

export const editableWorkspaces = (userId: string) =>
  db
    .select({ id: members.workspaceId })
    .from(members)
    .where(and(eq(members.userId, userId), inArray(members.role, EDITOR_ROLES)))

/** Relational-query `RAW` filters for rows of the workspaces the user belongs to, or edits. */
export const inMemberWorkspace =
  (userId: string) => (table: { workspaceId: Column }) =>
    inArray(table.workspaceId, memberWorkspaces(userId))

export const inEditableWorkspace =
  (userId: string) => (table: { workspaceId: Column }) =>
    inArray(table.workspaceId, editableWorkspaces(userId))

export const isWorkspaceEditor = async (userId: string, workspaceId: string) =>
  (await db.$count(
    members,
    and(
      eq(members.userId, userId),
      eq(members.workspaceId, workspaceId),
      inArray(members.role, EDITOR_ROLES)
    )
  )) > 0

export const workspaceMemberIds = async (workspaceId: string) => {
  const rows = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.workspaceId, workspaceId))

  return rows.map((row) => row.userId)
}

export const publishToWorkspace = async <TPayload extends object>(
  publisher: Publisher<Record<string, TPayload>>,
  workspaceId: string,
  payload: TPayload
) => {
  const userIds = await workspaceMemberIds(workspaceId)

  await Promise.all(userIds.map((userId) => publisher.publish(userId, payload)))
}

export const deleteSoleMemberWorkspaces = async (userId: string) => {
  const soleMember = db
    .select({ id: members.workspaceId })
    .from(members)
    .groupBy(members.workspaceId)
    .having(sql`count(*) = 1`)

  await db
    .delete(workspaces)
    .where(
      and(
        inArray(workspaces.id, memberWorkspaces(userId)),
        inArray(workspaces.id, soleMember)
      )
    )
}
