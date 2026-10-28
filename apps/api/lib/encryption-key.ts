import { db } from '@tamery/db'
import { workspaceEncryptionKeys } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const read = async (workspaceId: string) => {
  const [row] = await db
    .select({ secret: workspaceEncryptionKeys.secret })
    .from(workspaceEncryptionKeys)
    .where(eq(workspaceEncryptionKeys.workspaceId, workspaceId))
    .limit(1)

  return row?.secret
}

export const workspaceEncryptionKey = {
  async get(workspaceId: string) {
    const existing = await read(workspaceId)

    if (existing) {
      return existing
    }

    // Racing first requests each mint a key; the conflict keeps one, and everyone reads that one back.
    await db
      .insert(workspaceEncryptionKeys)
      .values({ secret: nanoid(), workspaceId })
      .onConflictDoNothing()

    const created = await read(workspaceId)

    if (!created) {
      throw new Error(`No encryption key for workspace ${workspaceId}`)
    }

    return created
  },
}
