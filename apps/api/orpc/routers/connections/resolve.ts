import { db } from '@tamery/db'
import { type } from 'arktype'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

export const resolve = orpc
  .use(authMiddleware)
  .input(
    type({ id: 'string.uuid.v7', 'updatedAt?': 'Date', 'version?': 'Date' })
  )
  .handler(async ({ context, input }) => {
    const connection = await db.query.connections.findFirst({
      columns: {
        connectionString: true,
        isPasswordExists: true,
        updatedAt: true,
        workspaceId: true,
      },
      where: {
        RAW: inMemberWorkspace(context.user.id),
        id: { eq: input.id },
      },
    })

    if (!connection) {
      return { status: 'not-found' as const }
    }

    const server = connection.updatedAt.getTime()
    // `updatedAt` is what older apps send: their own save time, which a pending edit makes newer than the server's.
    // `!==` there would answer with the older string and overwrite that edit, so only `version` compares exactly.
    const unchanged = input.version
      ? input.version.getTime() === server
      : !!input.updatedAt && input.updatedAt.getTime() >= server
    if (unchanged) {
      return { status: 'unchanged' as const }
    }

    if (!connection.connectionString) {
      return { status: 'no-connection-string' as const }
    }

    const connectionString = await context.decryptConnectionString({
      encryptedText: connection.connectionString,
      workspaceId: connection.workspaceId,
    })

    return {
      connectionString,
      isPasswordExists: connection.isPasswordExists,
      status: 'modified' as const,
      updatedAt: connection.updatedAt,
    }
  })
