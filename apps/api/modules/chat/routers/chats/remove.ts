import { db } from '@tamery/db'
import { chats } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq, inArray } from 'drizzle-orm'

import { authMiddleware, orpc } from '~/orpc'

import { publisher } from './events'

const removeInput = type({
  id: 'string.uuid.v7',
})

export const remove = orpc
  .use(authMiddleware)
  .input(
    type
      .or(removeInput, removeInput.array())
      .pipe((data) => (Array.isArray(data) ? data : [data]))
  )
  .errors({
    BAD_REQUEST: { message: 'No chats to remove' },
  })
  .handler(async ({ context, errors, input }) => {
    if (input.length === 0) {
      throw errors.BAD_REQUEST()
    }

    await db.delete(chats).where(
      and(
        inArray(
          chats.id,
          input.map((item) => item.id)
        ),
        eq(chats.userId, context.user.id)
      )
    )

    for (const item of input) {
      publisher.publish(context.user.id, {
        key: item.id,
        type: 'delete',
      })
    }
  })
