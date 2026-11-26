import {
  describeConnectionString,
  resourceConnectionString,
} from '@tamery/connection/utils'
import { db } from '@tamery/db'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { type } from 'arktype'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { proxySecretMiddleware } from './proxy-secret'

const CONNECTION_COLUMNS = {
  connectionString: true,
  isPasswordExists: true,
  syncType: true,
  workspaceId: true,
} as const

export const proxy = {
  resolveConnectionString: orpc
    .use(proxySecretMiddleware)
    .use(authMiddleware)
    .input(
      type({ resourceId: 'string', 'withUserId?': 'true' }).or({
        connectionId: 'string',
        'withUserId?': 'true',
      })
    )
    .errors({
      FORBIDDEN: {
        message:
          'This connection is not allowed to be used because its secrets or connection string are not stored in the cloud.',
      },
      NOT_FOUND: { message: 'Connection not found' },
    })
    .handler(async ({ context, errors, input }) => {
      const owned = { RAW: inMemberWorkspace(context.user.id) }
      const resource =
        'resourceId' in input
          ? await db.query.connectionsResources.findFirst({
              columns: { name: true },
              where: { id: { eq: input.resourceId } },
              with: {
                connection: { columns: CONNECTION_COLUMNS, where: owned },
              },
            })
          : undefined
      const connection =
        'resourceId' in input
          ? resource?.connection
          : await db.query.connections.findFirst({
              columns: CONNECTION_COLUMNS,
              where: { id: { eq: input.connectionId }, ...owned },
            })
      if (!connection) {
        throw errors.NOT_FOUND()
      }
      const withoutSecrets =
        connection.syncType === SyncType.CloudWithoutSecrets
      if (
        !connection.connectionString ||
        (withoutSecrets && connection.isPasswordExists)
      ) {
        throw errors.FORBIDDEN()
      }

      const connectionString = await context.decryptConnectionString({
        encryptedText: connection.connectionString,
        workspaceId: connection.workspaceId,
      })
      if (
        withoutSecrets &&
        describeConnectionString(connectionString).missingSecrets.length > 0
      ) {
        throw errors.FORBIDDEN()
      }

      const resolved = resource
        ? resourceConnectionString(connectionString, resource.name)
        : connectionString
      // The API and the proxy deploy separately: a proxy that does not send `withUserId` reads the bare string.
      return input.withUserId
        ? { connectionString: resolved, userId: context.user.id }
        : resolved
    }),
}
