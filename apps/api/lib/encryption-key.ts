import { db } from '@conar/db'
import { workspaceEncryptionKeys } from '@conar/db/schema'
import { eq } from 'drizzle-orm'

import { ensureDefaultWorkspace } from './workspace'

// Conar keeps every connection in the user's default workspace, so that workspace's key is the user's key.
// ensureDefaultWorkspace mints the key with the workspace.
export const workspaceEncryptionKey = {
  async getForUser(userId: string) {
    const workspaceId = await ensureDefaultWorkspace(userId)
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
