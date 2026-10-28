import { db } from '@tamery/db'
import { connections, connectionsUpdateSchema } from '@tamery/db/schema'
import { decrypt } from '@tamery/shared/crypto-node'
import { and, eq } from 'drizzle-orm'

import { encryptConnectionString } from '~/lib/connection-string'
import { inEditableWorkspace, publishToWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher, syncedColumns } from './events'

export const update = orpc
  .use(authMiddleware)
  .input(
    connectionsUpdateSchema
      .omit('createdAt', 'userId', 'workspaceId', 'syncType')
      .merge(connectionsUpdateSchema.pick('id', 'updatedAt').required())
  )
  .errors({
    NOT_FOUND: { message: 'Connection not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const { id, ...changes } = input

    const connection = await db.transaction(async (tx) => {
      // Locked until the write lands: a move committing in between would leave this string under the old workspace's key.
      const [found] = await tx
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.id, id),
            inEditableWorkspace(context.user.id)(connections)
          )
        )
        .for('update')

      if (!found) {
        throw errors.NOT_FOUND()
      }

      const secret = await context.getWorkspaceSecret(found.workspaceId)

      const connectionString =
        changes.connectionString ??
        (found.connectionString &&
          decrypt({ encryptedText: found.connectionString, secret }))

      const [updated] = await tx
        .update(connections)
        .set({
          ...changes,
          connectionString: encryptConnectionString({
            connectionString,
            secret,
            syncType: found.syncType,
          }),
        })
        .where(eq(connections.id, id))
        .returning(syncedColumns)

      return updated
    })

    if (!connection) {
      throw errors.NOT_FOUND()
    }

    await publishToWorkspace(publisher, connection.workspaceId, {
      type: 'update',
      value: connection,
    })
  })
