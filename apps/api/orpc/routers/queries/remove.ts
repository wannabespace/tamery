import { db } from '@tamery/db'
import { queries } from '@tamery/db/schema/queries'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const remove = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input: { id } }) => {
    await db
      .delete(queries)
      .where(and(eq(queries.userId, context.user.id), eq(queries.id, id)))

    await publisher.publish(context.user.id, { key: id, type: 'delete' })
  })
