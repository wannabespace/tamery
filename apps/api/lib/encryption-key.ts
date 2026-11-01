import type { relations } from '@tamery/db'
import { db } from '@tamery/db'
import { workspaceEncryptionKeys } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'
import type { NodePgTransaction } from 'drizzle-orm/node-postgres'
import { nanoid } from 'nanoid'

const select = (executor: Pick<typeof db, 'select'>, workspaceId: string) =>
  executor
    .select({ secret: workspaceEncryptionKeys.secret })
    .from(workspaceEncryptionKeys)
    .where(eq(workspaceEncryptionKeys.workspaceId, workspaceId))
    .limit(1)

const secretOrThrow = ([row]: { secret: string }[], workspaceId: string) => {
  if (!row) {
    throw new Error(`No encryption key for workspace ${workspaceId}`)
  }

  return row.secret
}

export const workspaceEncryptionKey = {
  async create(workspaceId: string, executor: Pick<typeof db, 'insert'>) {
    await executor
      .insert(workspaceEncryptionKeys)
      .values({ secret: nanoid(), workspaceId })
  },
  async get(workspaceId: string) {
    return secretOrThrow(await select(db, workspaceId), workspaceId)
  },
  /**
   * The key a write encrypts under, held until `tx` ends so a rotation cannot replace it under the write. Lock the connection rows first: the rotation locks rows, then the key, and the other order deadlocks with it.
   */
  async getLocked(
    tx: NodePgTransaction<typeof relations>,
    workspaceId: string
  ) {
    return secretOrThrow(
      await select(tx, workspaceId).for('share'),
      workspaceId
    )
  },
}
