import { db } from '@tamery/db'
import { type } from 'arktype'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

export const resolve = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7', 'updatedAt?': 'Date' }))
  .handler(async ({ context, input }) => {
    const connection = await db.query.connections.findFirst({
      columns: {
        connectionString: true,
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

    if (
      !connection.connectionString ||
      (input.updatedAt &&
        input.updatedAt.getTime() >= connection.updatedAt.getTime())
    ) {
      return { status: 'unchanged' as const }
    }

    const connectionString = await context.decryptConnectionString({
      encryptedText: connection.connectionString,
      workspaceId: connection.workspaceId,
    })

    return {
      connectionString,
      status: 'modified' as const,
      updatedAt: connection.updatedAt,
    }
  })
