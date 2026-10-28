import { db } from '@tamery/db'
import { schemaNotes } from '@tamery/db/schema/schema-notes'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

export const remove = orpc
  .use(authMiddleware)
  .input(type({ id: 'string.uuid.v7' }))
  .handler(async ({ context, input: { id } }) => {
    await db
      .delete(schemaNotes)
      .where(
        and(eq(schemaNotes.userId, context.user.id), eq(schemaNotes.id, id))
      )

    publisher.publish(context.user.id, { key: id, type: 'delete' })
  })
