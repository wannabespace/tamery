import { chatStream } from '@tamery/ai/features'
import { CHAT_LIMITS } from '@tamery/ai/limits'
import type { AppUIMessage } from '@tamery/ai/message'
import { AiFeature } from '@tamery/ai/usage'
import { CHAT_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { validateUIMessages } from 'ai'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { chatPersist } from '~/lib/chat-persist'
import { credits } from '~/lib/credits'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const stream = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      connectionResourceId: 'string.uuid.v7',
      messages: 'object[]',
    })
  )
  .errors({
    BAD_REQUEST: { message: 'Invalid messages' },
    CONFLICT: { message: 'This chat is already generating an answer.' },
    TOO_MANY_REQUESTS: { message: CHAT_BUDGET_SPENT_MESSAGE },
  })
  .handler(async function* streamHandler({ context, errors, input }) {
    const messages = await validateUIMessages<AppUIMessage>({
      messages: input.messages,
    }).catch(() => {
      throw errors.BAD_REQUEST()
    })

    const turn = messages.at(-1)
    if (!turn || turn.role === 'system') {
      throw errors.BAD_REQUEST()
    }

    if (!(await credits.canChat(context.user.id))) {
      throw errors.TOO_MANY_REQUESTS()
    }

    const { connection, title } = await chatPersist.ensureChat({
      chatId: input.chatId,
      connectionResourceId: input.connectionResourceId,
      userId: context.user.id,
    })

    await (
      turn.role === 'user'
        ? chatPersist.persistMessage
        : chatPersist.persistToolOutputs
    )({
      chatId: input.chatId,
      message: turn,
      userId: context.user.id,
    })

    const history = await chatPersist.loadMessages({
      chatId: input.chatId,
      userId: context.user.id,
    })

    const previousAnswer = history.at(-1)
    if (turn.role === 'user' && previousAnswer?.role === 'assistant') {
      await chatPersist.deleteMessage({
        chatId: input.chatId,
        messageId: previousAnswer.id,
        userId: context.user.id,
      })
      history.pop()
    }

    if (!title) {
      void chatPersist.persistTitle({
        chatId: input.chatId,
        messages: history,
        userId: context.user.id,
      })
    }

    const str = await chatStream.claim({
      chatId: input.chatId,
      connection,
      limits: CHAT_LIMITS.message,
      messages: history,
      onFinish: (message) =>
        chatPersist.persistMessage({
          chatId: input.chatId,
          message,
          userId: context.user.id,
        }),
      telemetry: aiUsage.telemetry({
        chatId: input.chatId,
        feature: AiFeature.Chat,
        userId: context.user.id,
      }),
    })

    if (str) {
      yield* str
      return
    }

    const active = await chatStream.resume(input.chatId)
    if (!active) {
      throw errors.CONFLICT()
    }

    yield* active
  })
