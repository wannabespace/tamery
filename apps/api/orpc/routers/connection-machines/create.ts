import { db } from '@tamery/db'
import {
  connectionMachines,
  connectionMachinesInsertSchema,
  connections,
} from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'
import { canRunOn } from './machine'

export const create = orpc
  .use(authMiddleware)
  .input(
    connectionMachinesInsertSchema.omit('userId', 'createdAt', 'updatedAt')
  )
  .errors({
    NOT_FOUND: { message: 'Connection or machine not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const [connection] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(
        and(
          eq(connections.id, input.connectionId),
          inMemberWorkspace(context.user.id)(connections)
        )
      )

    if (
      !connection ||
      !(await canRunOn(context.user.id, input.machineId ?? null))
    ) {
      throw errors.NOT_FOUND()
    }

    const [row] = await db
      .insert(connectionMachines)
      .values({ ...input, userId: context.user.id })
      .onConflictDoUpdate({
        set: { machineId: input.machineId ?? null, updatedAt: new Date() },
        target: [connectionMachines.userId, connectionMachines.connectionId],
      })
      .returning()

    if (!row) {
      throw new Error('Failed to set the connection machine')
    }

    publisher.publish(context.user.id, {
      type:
        row.createdAt.getTime() === row.updatedAt.getTime()
          ? 'insert'
          : 'update',
      value: row,
    })

    return row
  })
