import type { Publisher } from '@orpc/publisher'
import { db } from '@tamery/db'
import {
  connections,
  connectionsResources,
  members,
  shares,
  workspaces,
} from '@tamery/db/schema'
import { slugify } from '@tamery/shared/slugify'
import {
  EDITOR_ROLES,
  isDefaultWorkspaceMetadata,
  serializeWorkspaceMetadata,
} from '@tamery/shared/workspace'
import type { Column, SQL } from 'drizzle-orm'
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

import { workspaceEncryptionKey } from '~/lib/encryption-key'

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
    await workspaceEncryptionKey.create(workspace.id, tx)

    return workspace.id
  })
}

const hasEditorRole = inArray(members.role, EDITOR_ROLES)

const memberWorkspaces = (userId: string, role?: SQL) =>
  db
    .select({ id: members.workspaceId })
    .from(members)
    .where(and(eq(members.userId, userId), role))

export const inMemberWorkspace =
  (userId: string) => (table: { workspaceId: Column }) =>
    inArray(table.workspaceId, memberWorkspaces(userId))

export const inEditableWorkspace =
  (userId: string) => (table: { workspaceId: Column }) =>
    inArray(table.workspaceId, memberWorkspaces(userId, hasEditorRole))

export const isWorkspaceEditor = async (userId: string, workspaceId: string) =>
  (await db.$count(
    members,
    and(
      eq(members.userId, userId),
      eq(members.workspaceId, workspaceId),
      hasEditorRole
    )
  )) > 0

export const workspaceMemberIds = async (workspaceId: string) => {
  const rows = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.workspaceId, workspaceId))

  return rows.map((row) => row.userId)
}

export const publishToUsers = async <TPayload extends object>(
  publisher: Publisher<Record<string, TPayload>>,
  userIds: string[],
  payloads: TPayload[]
) => {
  await Promise.all(
    userIds.flatMap((userId) =>
      payloads.map((payload) => publisher.publish(userId, payload))
    )
  )
}

export const publishToWorkspace = async <TPayload extends object>(
  publisher: Publisher<Record<string, TPayload>>,
  workspaceId: string,
  payload: TPayload
) => {
  await publishToUsers(publisher, await workspaceMemberIds(workspaceId), [
    payload,
  ])
}

/** A share reads its connection with the workspace's key, so it must not outlive its author's right to edit that workspace. */
export const revokeNonEditorShares = async (workspaceId: string) => {
  await db.delete(shares).where(
    and(
      inArray(
        shares.connectionResourceId,
        db
          .select({ id: connectionsResources.id })
          .from(connectionsResources)
          .innerJoin(
            connections,
            eq(connections.id, connectionsResources.connectionId)
          )
          .where(eq(connections.workspaceId, workspaceId))
      ),
      notInArray(
        shares.userId,
        db
          .select({ id: members.userId })
          .from(members)
          .where(and(eq(members.workspaceId, workspaceId), hasEditorRole))
      )
    )
  )
}

export const lastOwnedSharedWorkspaces = async (userId: string) => {
  const rows = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .innerJoin(members, eq(members.workspaceId, workspaces.id))
    .where(
      inArray(
        workspaces.id,
        memberWorkspaces(userId, eq(members.role, 'owner'))
      )
    )
    .groupBy(workspaces.id, workspaces.name)
    .having(
      and(
        sql`count(*) > 1`,
        sql`count(*) filter (where ${members.role} = 'owner') = 1`
      )
    )

  return rows.map((row) => row.name)
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
