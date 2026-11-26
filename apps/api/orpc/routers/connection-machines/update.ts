import { db } from '@tamery/db'
import { connectionMachines, machines } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const update = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7', machineId: 'string.uuid.v7' }))
  .errors({
    NOT_FOUND: { message: 'Machine not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const [machine] = await db
      .select({ id: machines.id })
      .from(machines)
      .where(
        and(
          eq(machines.id, input.machineId),
          eq(machines.userId, context.user.id)
        )
      )
    if (!machine) {
      throw errors.NOT_FOUND()
    }

    const [updated] = await db
      .update(connectionMachines)
      .set({ machineId: input.machineId, updatedAt: new Date() })
      .where(
        and(
          eq(connectionMachines.id, input.id),
          eq(connectionMachines.userId, context.user.id)
        )
      )
      .returning()

    if (!updated) {
      throw errors.NOT_FOUND()
    }

    publisher.publish(context.user.id, { type: 'update', value: updated })
    return updated
  })
