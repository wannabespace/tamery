import { db } from '@tamery/db'
import {
  chats,
  chatsMessages,
  chatsMessagesUpdateSchema,
} from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm'

import { orpc, permissionsMiddleware, permix } from '~/orpc'

import { publisher } from './events'

export const update = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    chatsMessagesUpdateSchema
      .omit('createdAt', 'updatedAt', 'id', 'chatId')
      .merge(chatsMessagesUpdateSchema.pick('id').required())
  )
  .errors({
    NOT_FOUND: { message: 'Chat message not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const [found] = await db
      .select({ chatId: chatsMessages.chatId, userId: chats.userId })
      .from(chatsMessages)
      .innerJoin(chats, eq(chatsMessages.chatId, chats.id))
      .where(
        and(eq(chatsMessages.id, input.id), eq(chats.userId, context.user.id))
      )

    if (!found) {
      throw errors.NOT_FOUND()
    }

    const [message] = await db
      .update(chatsMessages)
      .set(input)
      .where(eq(chatsMessages.id, input.id))
      .returning()

    if (!message) {
      throw errors.NOT_FOUND({ message: 'Chat message not found after update' })
    }

    await publisher.publish(context.user.id, {
      type: 'update',
      value: message,
    })
  })
