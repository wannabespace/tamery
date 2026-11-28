import { chatStream } from '@tamery/ai/features'
import { db } from '@tamery/db'
import { type } from 'arktype'

import { orpc, aiPermissionsMiddleware, permix } from '~/orpc'

export const claimToolCall = orpc
  .use(aiPermissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      toolCallId: 'string > 0',
      windowId: 'string.uuid.v7',
    })
  )
  .handler(async ({ context, input }) => {
    const owned = await db.query.chats.findFirst({
      columns: { id: true },
      where: { id: { eq: input.chatId }, userId: { eq: context.user.id } },
    })
    return !!owned && chatStream.claimToolCall(input)
  })
