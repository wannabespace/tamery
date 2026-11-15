import {
  afterCompaction,
  chatStream,
  needsCompaction,
  pickChatModel,
} from '@tamery/ai/features'
import { CHAT_LIMITS } from '@tamery/ai/limits'
import type { AppUIMessage } from '@tamery/ai/message'
import { resolveChatContext } from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { runInBackground } from '@tamery/shared/background'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { isToolUIPart, validateUIMessages } from 'ai'
import { type } from 'arktype'

import { payForAi } from '~/lib/ai-key'
import { chatPersist } from '~/lib/chat-persist'
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
    TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE },
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

    const payer = await payForAi(context.user.id, errors.TOO_MANY_REQUESTS)

    const { connection, isSubagent, title } = await chatPersist.ensureChat({
      chatId: input.chatId,
      connectionResourceId: input.connectionResourceId,
      subagent: input.subagent,
      userId: context.user.id,
    })

    if (turn.role === 'user') {
      await chatPersist.truncateFrom({
        chatId: input.chatId,
        messageId: turn.id,
        userId: context.user.id,
      })
    }

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

    if (!title) {
      runInBackground(
        chatPersist.persistTitle({
          chatId: input.chatId,
          messages: history,
          payer,
          userId: context.user.id,
        })
      )
    }

    const scope = {
      chatId: input.chatId,
      feature: AiFeature.Chat,
      userId: context.user.id,
    }
    const model = await pickChatModel({
      key: payer.key,
      messages: history,
      model: input.model,
      onJevUsage: payer.recordJev(scope),
    })
    const contextTokens = resolveChatContext(model, input.context)
    const telemetry = payer.telemetry(scope)
    const stored = await chatPersist.compaction(input.chatId)
    const compaction =
      turn.role === 'user' &&
      needsCompaction(afterCompaction(history, stored), contextTokens)
        ? await chatPersist.compact({
            chatId: input.chatId,
            history,
            key: payer.key,
            previous: stored,
            telemetry,
            userId: context.user.id,
          })
        : stored

    const str = await chatStream.claim({
      chatId: input.chatId,
      connection,
      messages: afterCompaction(history, compaction),
      contextTokens,
      effort: input.effort,
      fast: input.fast,
      isSubagent,
      key: payer.key,
      model,
      onFinish: async (message) => {
        await chatPersist.persistMessage({
          chatId: input.chatId,
          message,
          userId: context.user.id,
        })
        const lastPart = message.parts.at(-1)
        // A step ending on a tool call is not the answer's end: the window answers it, or the change waits for Run.
        const isAnswered = !(lastPart && isToolUIPart(lastPart))
        if (!isSubagent && !message.metadata?.stopped && isAnswered) {
          runInBackground(
            chatPersist.persistSuggestion({
              chatId: input.chatId,
              history,
              message,
              payer,
              userId: context.user.id,
            })
          )
        }
      },
      summary: compaction?.summary,
      telemetry,
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
