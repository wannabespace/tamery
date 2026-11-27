import {
  afterCompaction,
  chatStream,
  needsCompaction,
  pickChatModel,
} from '@tamery/ai/features'
import { CHAT_LIMITS } from '@tamery/ai/limits'
import type { AppUIMessage } from '@tamery/ai/message'
import {
  AUTO_MODEL,
  chatModelPick,
  MODEL_UNAVAILABLE_MESSAGE,
  resolveChatContext,
} from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { parseAttachmentRef } from '@tamery/shared/attachments'
import { runInBackground } from '@tamery/shared/background'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { isToolUIPart, validateUIMessages } from 'ai'
import { type } from 'arktype'

import { payForAi } from '~/lib/ai-key'
import { attachments } from '~/lib/chat/attachments'
import { chatCompaction } from '~/lib/chat/compaction'
import { chatPersist } from '~/lib/chat/persist'
import { chatSession } from '~/lib/chat/session'
import { persistChatSuggestion } from '~/lib/chat/suggestion'
import { persistChatTitle } from '~/lib/chat/title'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

const isAttachmentId = type('string.uuid.v7')

// A file arrives as a data URL, or as a reference to one already stored in this chat when a turn is edited or asked again; a remote URL would have the model provider fetch it on the user's behalf.
const attachmentsFit = async (chatId: string, message: AppUIMessage) => {
  const files = message.parts.filter((part) => part.type === 'file')
  if (files.length > CHAT_LIMITS.attachments) {
    return false
  }
  const fits = await Promise.all(
    files.map((file) => {
      if (!CHAT_LIMITS.attachmentTypes.has(file.mediaType)) {
        return false
      }
      const ref = parseAttachmentRef(file.url)
      if (ref) {
        return (
          ref.chatId === chatId &&
          isAttachmentId.allows(ref.id) &&
          attachments.exists(ref)
        )
      }
      const prefix = `data:${file.mediaType};base64,`
      return (
        file.url.startsWith(prefix) &&
        ((file.url.length - prefix.length) * 3) / 4 <=
          CHAT_LIMITS.attachmentBytes
      )
    })
  )
  return fits.every(Boolean)
}

export const stream = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      chatId: 'string.uuid.v7',
      connectionResourceId: 'string.uuid.v7',
      messages: 'object[]',
      'agent?': 'true',
      'context?': 'number.integer > 0',
      'effort?': "'low' | 'medium' | 'high' | 'xhigh'",
      'fast?': 'boolean',
      'model?': chatModelPick,
      'subagent?': { parentChatId: 'string.uuid.v7', title: 'string' },
    })
  )
  .errors({
    BAD_REQUEST: { message: 'Invalid messages' },
    CONFLICT: { message: 'This chat is already generating an answer.' },
    MODEL_UNAVAILABLE: { message: MODEL_UNAVAILABLE_MESSAGE },
    TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE },
  })
  .handler(async function* streamHandler({ context, errors, input }) {
    const messages = await validateUIMessages<AppUIMessage>({
      messages: input.messages,
    }).catch(() => {
      throw errors.BAD_REQUEST()
    })

    const turn = messages.at(-1)
    if (
      !turn ||
      turn.role === 'system' ||
      !(await attachmentsFit(input.chatId, turn))
    ) {
      throw errors.BAD_REQUEST()
    }

    const payer = await payForAi(context.user.id, errors.TOO_MANY_REQUESTS)

    const { connection, isSubagent, title } = await chatSession.ensureChat({
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

    await (turn.role === 'user'
      ? chatPersist.persistMessage({
          chatId: input.chatId,
          message: await attachments.store(input.chatId, turn),
          userId: context.user.id,
        })
      : chatPersist.persistToolOutputs({
          chatId: input.chatId,
          message: turn,
          userId: context.user.id,
        }))

    const history = await chatPersist.loadMessages({
      chatId: input.chatId,
      userId: context.user.id,
    })

    if (!title) {
      runInBackground(
        persistChatTitle({
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
    const pick = await pickChatModel({
      effort: input.effort,
      keys: payer.keys,
      messages: history,
      model: input.model ?? AUTO_MODEL,
      onJevUsage: payer.recordJev(scope),
    })
    if (!pick) {
      throw errors.MODEL_UNAVAILABLE()
    }
    const contextTokens = resolveChatContext(pick.model, input.context)
    const telemetry = payer.telemetry(scope)
    const stored = await chatCompaction.get(input.chatId)
    const compaction =
      turn.role === 'user' &&
      needsCompaction(afterCompaction(history, stored), contextTokens)
        ? await chatCompaction.compact({
            chatId: input.chatId,
            history,
            key: payer.key,
            previous: stored,
            telemetry,
            userId: context.user.id,
          })
        : stored

    const str = await chatStream.claim({
      ...pick,
      agent: input.agent ?? false,
      chatId: input.chatId,
      connection,
      messages: afterCompaction(history, compaction),
      contextTokens,
      fast: input.fast,
      isSubagent,
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
            persistChatSuggestion({
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
