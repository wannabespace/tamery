import { db } from '@tamery/db'
import { connections, connectionsInsertSchema } from '@tamery/db/schema'
import { GUEST_CONNECTIONS_MESSAGE } from '@tamery/shared/constants'
import { type } from 'arktype'
import { and, eq, ne } from 'drizzle-orm'

import { encryptConnectionString } from '~/lib/connection-string'
import {
  ensureDefaultWorkspace,
  isWorkspaceEditor,
  publishToWorkspace,
} from '~/lib/workspace'
import { orpc, permissionsMiddleware } from '~/orpc'

import { publisher, syncedColumns } from './events'

export const create = orpc
  .use(permissionsMiddleware)
  .input(
    connectionsInsertSchema
      .omit('userId', 'workspaceId')
      .merge(type({ id: 'string.uuid.v7', 'workspaceId?': 'string | null' }))
  )
  .errors({
    FORBIDDEN: { message: GUEST_CONNECTIONS_MESSAGE },
  })
  .handler(async ({ context, errors, input }) => {
    if (
      input.workspaceId &&
      !(await isWorkspaceEditor(context.user.id, input.workspaceId))
    ) {
      throw errors.FORBIDDEN({
        message: 'Only editors can add connections to this workspace.',
      })
    }

    const workspaceId =
      input.workspaceId ?? (await ensureDefaultWorkspace(context.user.id))
    const workspaceSecret = await context.getWorkspaceSecret(workspaceId)

    // Excludes its own id, or an outbox replay of a lost response counts its own row and fails.
    const count = await db.$count(
      connections,
      and(eq(connections.userId, context.user.id), ne(connections.id, input.id))
    )

    if (!context.permissions.check('connection.create', { count })) {
      throw errors.FORBIDDEN()
    }

    const [inserted] = await db
      .insert(connections)
      .values({
        ...input,
        connectionString: encryptConnectionString({
          connectionString: input.connectionString,
          secret: workspaceSecret,
          syncType: input.syncType,
        }),
        userId: context.user.id,
        workspaceId,
      })
      .onConflictDoNothing()
      .returning(syncedColumns)

    if (inserted) {
      await publishToWorkspace(publisher, workspaceId, {
        type: 'insert',
        value: inserted,
      })
    }
  })
