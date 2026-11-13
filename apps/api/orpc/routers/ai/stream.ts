import { chatStream } from '@tamery/ai/features'
import { CHAT_LIMITS } from '@tamery/ai/limits'
import type { AppUIMessage } from '@tamery/ai/message'
import {
  DEFAULT_CHAT_EFFORT,
  resolveChatContext,
  resolveChatModel,
} from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { runInBackground } from '@tamery/shared/background'
import { CHAT_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { validateUIMessages } from 'ai'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { chatPersist } from '~/lib/chat-persist'
import { credits } from '~/lib/credits'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

// A file rides in the transcript as a data URL; a remote URL would have the model provider fetch it on the user's behalf.
const attachmentsFit = (message: AppUIMessage) => {
  const files = message.parts.filter((part) => part.type === 'file')
  return (
    files.length <= CHAT_LIMITS.attachments &&
    files.every((file) => {
      const prefix = `data:${file.mediaType};base64,`
      return (
        CHAT_LIMITS.attachmentTypes.has(file.mediaType) &&
        file.url.startsWith(prefix) &&
        ((file.url.length - prefix.length) * 3) / 4 <=
          CHAT_LIMITS.attachmentBytes
      )
    })
  )
}

export const stream = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      connectionResourceId: 'string.uuid.v7',
      messages: 'object[]',
      'context?': 'number.integer > 0',
      'effort?': "'low' | 'medium' | 'high' | 'xhigh'",
      'fast?': 'boolean',
      'model?': 'string',
      'subagent?': { parentChatId: 'string.uuid.v7', title: 'string' },
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
    if (!turn || turn.role === 'system' || !attachmentsFit(turn)) {
      throw errors.BAD_REQUEST()
    }

    if (!(await credits.canChat(context.user.id))) {
      throw errors.TOO_MANY_REQUESTS()
    }

    const { connection, isSubagent, title } = await chatPersist.ensureChat({
      chatId: input.chatId,
      connectionResourceId: input.connectionResourceId,
      subagent: input.subagent,
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
      runInBackground(
        chatPersist.persistTitle({
          chatId: input.chatId,
          messages: history,
          userId: context.user.id,
        })
      )
    }

    const str = await chatStream.claim({
      chatId: input.chatId,
      connection,
      limits: CHAT_LIMITS.message,
      messages: history,
      contextTokens: resolveChatContext(
        resolveChatModel(input.model),
        input.context
      ),
      effort: input.effort ?? DEFAULT_CHAT_EFFORT,
      fast: input.fast ?? false,
      isSubagent,
      model: resolveChatModel(input.model),
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
