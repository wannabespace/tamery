import { chatStream } from '@tamery/ai/features'
import { db } from '@tamery/db'
import { type } from 'arktype'

import { chatPersist } from '~/lib/chat-persist'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const abortStream = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(type({ chatId: 'string.uuid.v7' }))
  .handler(async ({ context, input }) => {
    const owned = await db.query.chats.findFirst({
      columns: { id: true },
      where: { id: { eq: input.chatId }, userId: { eq: context.user.id } },
    })

    if (!owned) {
      return
    }

    await Promise.all([
      chatStream.stop(input.chatId),
      chatPersist.markStopped({
        chatId: input.chatId,
        userId: context.user.id,
      }),
    ])
  })
