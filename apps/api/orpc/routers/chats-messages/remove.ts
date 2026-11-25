import { db } from '@tamery/db'
import { chats, chatsMessages } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq, inArray, or } from 'drizzle-orm'

import { orpc, permissionsMiddleware, permix } from '~/orpc'

import { publisher } from './events'

const removeInput = type({
  chatId: 'string.uuid.v7',
  id: 'string.uuid.v7',
})

export const remove = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type
      .or(removeInput, removeInput.array())
      .pipe((data) => (Array.isArray(data) ? data : [data]))
  )
  .errors({
    BAD_REQUEST: { message: 'No chat messages to remove' },
  })
  .handler(async ({ context, errors, input }) => {
    if (input.length === 0) {
      throw errors.BAD_REQUEST()
    }

    const toRemove = await db
      .select({ id: chatsMessages.id })
      .from(chatsMessages)
      .innerJoin(chats, eq(chatsMessages.chatId, chats.id))
      .where(
        and(
          eq(chats.userId, context.user.id),
          or(
            ...input.map((item) =>
              and(
                eq(chatsMessages.id, item.id),
                eq(chatsMessages.chatId, item.chatId)
              )
            )
          )
        )
      )

    await db.delete(chatsMessages).where(
      inArray(
        chatsMessages.id,
        toRemove.map((item) => item.id)
      )
    )

    await Promise.all(
      toRemove.map((item) =>
        publisher.publish(context.user.id, { key: item.id, type: 'delete' })
      )
    )
  })
