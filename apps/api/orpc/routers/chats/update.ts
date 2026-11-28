import { compactAt } from '@tamery/ai/models'
import { db } from '@tamery/db'
import { chats, chatsUpdateSchema } from '@tamery/db/schema'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm/sql'

import { orpc, aiPermissionsMiddleware, permix } from '~/orpc'

import { publisher } from './events'

export const update = orpc
  .use(aiPermissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    chatsUpdateSchema
      .pick('pinnedAt', 'title')
      .merge(chatsUpdateSchema.pick('id').required())
      .merge(type({ 'compactAt?': compactAt.or('null') }))
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
