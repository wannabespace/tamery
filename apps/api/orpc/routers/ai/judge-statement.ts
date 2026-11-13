import { judgeStatement as judge } from '@tamery/ai/features'
import { AiFeature } from '@tamery/ai/usage'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { chatPersist } from '~/lib/chat-persist'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

const REQUEST_LIMIT = 4000

export const judgeStatement = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      dialect: 'string',
      statement: 'string',
    })
  )
  .handler(async ({ context, input, signal }) => {
    // The request comes from the stored transcript, never the client, so only the user's own words can vouch for a change.
    const messages = await chatPersist.loadMessages({
      chatId: input.chatId,
      userId: context.user.id,
    })
    const request = messages
      .findLast((message) => message.role === 'user')
      ?.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join('\n')
      .slice(0, REQUEST_LIMIT)
    if (!request) {
      return null
    }

    const scope = {
      chatId: input.chatId,
      feature: AiFeature.ApprovalJudge,
      userId: context.user.id,
    }
    return judge({
      dialect: input.dialect,
      onJevUsage: (usage) => aiUsage.recordPriced(scope, usage),
      request,
      signal,
      statement: input.statement,
      telemetry: aiUsage.telemetry(scope),
    })
  })
