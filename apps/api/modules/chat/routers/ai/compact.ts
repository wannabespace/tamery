import { AiFeature } from '@tamery/ai/usage'
import { type } from 'arktype'

import { aiPermissionsMiddleware, orpc, paidAiMiddleware, permix } from '~/orpc'

import { attachments } from '../../attachments'
import { chatCompaction } from '../../compaction'
import { chatPersist } from '../../persist'

export const compact = orpc
  .use(aiPermissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .use(paidAiMiddleware)
  .input(type({ chatId: 'string.uuid.v7' }))
  .handler(async ({ context, input }) => {
    const { key, telemetry } = context.payer
    const history = await chatPersist.loadMessages({
      chatId: input.chatId,
      userId: context.user.id,
    })
    if (history.length === 0) {
      return
    }
    await chatCompaction.compact({
      chatId: input.chatId,
      history: await attachments.forModel(history),
      key,
      previous: await chatCompaction.get({
        chatId: input.chatId,
        userId: context.user.id,
      }),
      telemetry: telemetry({
        chatId: input.chatId,
        feature: AiFeature.Chat,
        userId: context.user.id,
      }),
      userId: context.user.id,
    })
  })
