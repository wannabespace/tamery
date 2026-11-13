import { AiFeature } from '@tamery/ai/usage'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { chatPersist } from '~/lib/chat-persist'
import { credits } from '~/lib/credits'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const compact = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(type({ chatId: 'string.uuid.v7' }))
  .errors({ TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE } })
  .handler(async ({ context, errors, input }) => {
    if (!(await credits.canUseAi(context.user.id))) {
      throw errors.TOO_MANY_REQUESTS()
    }
    const history = await chatPersist.loadMessages({
      chatId: input.chatId,
      userId: context.user.id,
    })
    if (history.length === 0) {
      return
    }
    await chatPersist.compact({
      chatId: input.chatId,
      history,
      previous: await chatPersist.compaction(input.chatId),
      telemetry: aiUsage.telemetry({
        chatId: input.chatId,
        feature: AiFeature.Chat,
        userId: context.user.id,
      }),
      userId: context.user.id,
    })
  })
