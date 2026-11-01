import { db } from '@conar/db'
import { members, workspaceEncryptionKeys, workspaces } from '@conar/db/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// Same metadata and name as Tamery's default workspace: both apps share it.
const DEFAULT_WORKSPACE_METADATA = JSON.stringify({ default: true })
const DEFAULT_WORKSPACE_NAME = 'Personal'

const defaultWorkspaceId = async (userId: string, executor: Pick<typeof db, 'select'> = db) => {
  const [row] = await executor
    .select({ id: workspaces.id })
    .from(members)
    .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
    .where(
      and(eq(members.userId, userId), sql`${workspaces.metadata}::jsonb ->> 'default' = 'true'`),
    )
    .orderBy(asc(members.createdAt))
    .limit(1)

  return row?.id ?? null
}

export const ensureDefaultWorkspace = async (userId: string) =>
  (await defaultWorkspaceId(userId)) ??
  db.transaction(async tx => {
    // Re-checked under the lock: racing requests would each create a default workspace.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)

    const lockedId = await defaultWorkspaceId(userId, tx)

    if (lockedId) {
      return lockedId
    }

    const [workspace] = await tx
      .insert(workspaces)
      .values({
        metadata: DEFAULT_WORKSPACE_METADATA,
        name: DEFAULT_WORKSPACE_NAME,
        slug: `personal-${nanoid(8)}`,
      })
      .returning({ id: workspaces.id })

    await tx.insert(members).values({ role: 'owner', userId, workspaceId: workspace!.id })
    // Same as Tamery's ensureDefaultWorkspace: every workspace gets its own key at creation.
    await tx
      .insert(workspaceEncryptionKeys)
      .values({ secret: nanoid(), workspaceId: workspace!.id })

    return workspace!.id
  })
