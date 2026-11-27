import { AiFeature } from '@tamery/ai/usage'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { type } from 'arktype'

import { payForAi } from '~/lib/ai-key'
import { attachments } from '~/lib/chat/attachments'
import { chatCompaction } from '~/lib/chat/compaction'
import { chatPersist } from '~/lib/chat/persist'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const compact = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(type({ chatId: 'string.uuid.v7' }))
  .errors({ TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE } })
  .handler(async ({ context, errors, input }) => {
    const { key, telemetry } = await payForAi(
      context.user.id,
      errors.TOO_MANY_REQUESTS
    )
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
      previous: await chatCompaction.get(input.chatId),
      telemetry: telemetry({
        chatId: input.chatId,
        feature: AiFeature.Chat,
        userId: context.user.id,
      }),
      userId: context.user.id,
    })
  })
