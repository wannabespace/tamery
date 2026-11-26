import { judgeStatement as judge } from '@tamery/ai/features'
import { isSqlRun, textFromMessage } from '@tamery/ai/message'
import { AiFeature } from '@tamery/ai/usage'
import { type } from 'arktype'

import { aiKey, getAiPayer } from '~/lib/ai-key'
import { chatPersist } from '~/lib/chat-persist'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

const REQUEST_LIMIT = 4000

export const judgeStatement = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      additive: 'boolean',
      chatId: 'string.uuid.v7',
      dialect: 'string',
      statement: 'string',
    })
  )
  .handler(async ({ context, input, signal }) => {
    // The request, the answers to the agent's questions since and the proposal it answers come from the stored transcript, never the client, so only what the user said or agreed to can vouch for a change.
    const messages = await chatPersist.loadMessages({
      chatId: input.chatId,
      userId: context.user.id,
    })
    const asked = messages.findLastIndex(
      (message) => message.role === 'user' && !isSqlRun(message)
    )
    const answers = messages
      .slice(asked + 1)
      .flatMap(({ parts }) => parts)
      .flatMap((part) =>
        part.type === 'tool-ask_user' && part.state === 'output-available'
          ? part.output.answers
          : []
      )
      .map(({ answer, question }) => `${question} ${answer.join(', ')}`)
    const asks = textFromMessage(messages[asked] ?? { parts: [] })
    if (!asks) {
      return null
    }
    const request = [asks, ...answers].join('\n').slice(0, REQUEST_LIMIT)
    const proposal = textFromMessage(
      messages.findLast(
        (message, index) => index < asked && message.role === 'assistant'
      ) ?? { parts: [] }
    ).slice(-REQUEST_LIMIT)

    const scope = {
      chatId: input.chatId,
      feature: AiFeature.ApprovalJudge,
      userId: context.user.id,
    }
    const payer = getAiPayer(await aiKey.enabled(context.user.id))
    return judge({
      additive: input.additive,
      dialect: input.dialect,
      key: payer.key,
      onJevUsage: payer.recordJev(scope),
      proposal,
      request,
      signal,
      statement: input.statement,
      telemetry: payer.telemetry(scope),
    })
  })
