import { db } from '@tamery/db'
import { connectionMachines, machines } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher as connectionMachinesPublisher } from '../connection-machines/events'
import { publisher } from './events'

export const remove = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input: { id } }) => {
    // The cascade would drop these rows without telling the devices that route by them.
    const unassigned = await db.transaction(async (tx) => {
      const rows = await tx
        .delete(connectionMachines)
        .where(
          and(
            eq(connectionMachines.userId, context.user.id),
            eq(connectionMachines.machineId, id)
          )
        )
        .returning({ id: connectionMachines.id })
      await tx
        .delete(machines)
        .where(and(eq(machines.userId, context.user.id), eq(machines.id, id)))
      return rows
    })

    for (const row of unassigned) {
      connectionMachinesPublisher.publish(context.user.id, {
        key: row.id,
        type: 'delete',
      })
    }
    publisher.publish(context.user.id, { key: id, type: 'delete' })
  })
