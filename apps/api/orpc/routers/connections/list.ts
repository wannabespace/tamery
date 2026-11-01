import { db } from '@tamery/db'
import { connections } from '@tamery/db/schema'
import { and, desc, isNotNull } from 'drizzle-orm'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

export const list = orpc
  .use(authMiddleware)
  .errors({
    INTERNAL_SERVER_ERROR: { message: 'Failed to decrypt connection string' },
  })
  .handler(async ({ context, errors }) => {
    const connectionsList = await db
      .select({
        connectionString: connections.connectionString,
        createdAt: connections.createdAt,
        id: connections.id,
        isPasswordExists: connections.isPasswordExists,
        name: connections.name,
        type: connections.type,
        updatedAt: connections.updatedAt,
        workspaceId: connections.workspaceId,
      })
      .from(connections)
      .where(
        and(
          inMemberWorkspace(context.user.id)(connections),
          isNotNull(connections.connectionString)
        )
      )
      .orderBy(desc(connections.createdAt))

    return Promise.all(
      connectionsList.map(
        async ({ connectionString, workspaceId, ...connection }) => {
          try {
            return {
              ...connection,
              connectionString: await context.decryptConnectionString({
                // oxlint-disable-next-line typescript/no-non-null-assertion -- isNotNull in where
                encryptedText: connectionString!,
                workspaceId,
              }),
            }
          } catch {
            throw errors.INTERNAL_SERVER_ERROR()
          }
        }
      )
    )
  })
