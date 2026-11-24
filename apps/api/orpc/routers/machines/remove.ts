import { db } from '@tamery/db'
import { machines } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const remove = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input: { id } }) => {
    await db
      .delete(machines)
      .where(and(eq(machines.userId, context.user.id), eq(machines.id, id)))

    publisher.publish(context.user.id, { key: id, type: 'delete' })
  })
