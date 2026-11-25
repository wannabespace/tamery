import { db } from '@tamery/db'
import { connectionMachines } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'
import { canRunOn } from './machine'

export const update = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7', machineId: 'string.uuid.v7 | null' }))
  .errors({
    NOT_FOUND: { message: 'Machine not found' },
  })
  .handler(async ({ context, errors, input }) => {
    if (!(await canRunOn(context.user.id, input.machineId))) {
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
  })
