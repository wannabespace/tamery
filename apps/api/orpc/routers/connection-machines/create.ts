import { db } from '@tamery/db'
import {
  connectionMachines,
  connectionMachinesInsertSchema,
  connections,
  machines,
} from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm'

import { inMemberWorkspace } from '~/lib/workspace'
import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const create = orpc
  .use(authMiddleware)
  .input(connectionMachinesInsertSchema.omit('userId'))
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
    const [machine] = await db
      .select({ id: machines.id })
      .from(machines)
      .where(
        and(
          eq(machines.id, input.machineId),
          eq(machines.userId, context.user.id)
        )
      )

    if (!connection || !machine) {
      throw errors.NOT_FOUND()
    }

    const [inserted] = await db
      .insert(connectionMachines)
      .values({ ...input, userId: context.user.id })
      .onConflictDoNothing()
      .returning()

    if (inserted) {
      publisher.publish(context.user.id, { type: 'insert', value: inserted })
    }
  })
