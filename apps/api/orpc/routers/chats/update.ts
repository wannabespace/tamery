import { db } from '@tamery/db'
import { chats, chatsUpdateSchema } from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm/sql'

import { orpc, permissionsMiddleware, permix } from '~/orpc'

import { publisher } from './events'

export const update = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    chatsUpdateSchema
      .omit(
        'compaction',
        'connectionResourceId',
        'createdAt',
        'id',
        'updatedAt',
        'userId'
      )
      .merge(chatsUpdateSchema.pick('id').required())
  )
  .handler(async ({ context, input }) => {
    const { id, ...changes } = input

    const [chat] = await db
      .update(chats)
      .set(changes)
      .where(and(eq(chats.id, id), eq(chats.userId, context.user.id)))
      .returning()

    if (!chat) {
      return
    }

    publisher.publish(context.user.id, {
      type: 'update',
      value: chat,
    })
  })
