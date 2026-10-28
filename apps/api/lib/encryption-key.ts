import { db } from '@tamery/db'
import { workspaceEncryptionKeys } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const workspaceEncryptionKey = {
  async create(workspaceId: string, executor: Pick<typeof db, 'insert'>) {
    await executor
      .insert(workspaceEncryptionKeys)
      .values({ secret: nanoid(), workspaceId })
  },
  async get(workspaceId: string) {
    const [row] = await db
      .select({ secret: workspaceEncryptionKeys.secret })
      .from(workspaceEncryptionKeys)
      .where(eq(workspaceEncryptionKeys.workspaceId, workspaceId))
      .limit(1)

    if (!row) {
      throw new Error(`No encryption key for workspace ${workspaceId}`)
    }

    return row.secret
  },
}
