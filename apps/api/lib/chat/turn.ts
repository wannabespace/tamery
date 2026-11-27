import { ORPCError } from '@orpc/server'
import {
  afterCompaction,
  chatStream,
  needsCompaction,
  pickChatModel,
} from '@tamery/ai/features'
import type { ChatEffort, ChatModelPick } from '@tamery/ai/models'
import {
  AUTO_MODEL,
  MODEL_UNAVAILABLE_MESSAGE,
  resolveChatContext,
} from '@tamery/ai/models'
import { AiFeature } from '@tamery/ai/usage'
import { runInBackground } from '@tamery/shared/background'
import { isToolUIPart } from 'ai'

import type { AiPayer } from '~/lib/ai-key'
import { chatCompaction } from '~/lib/chat/compaction'
import { chatPersist } from '~/lib/chat/persist'
import type { chatSession } from '~/lib/chat/session'
import { persistChatSuggestion } from '~/lib/chat/suggestion'
import { persistChatTitle } from '~/lib/chat/title'
import { credits } from '~/lib/credits'

const PAID_STREAMS_BUSY_MESSAGE =
  'Tamery AI is already answering in several of your chats. Try again once one of them finishes.'

/** One turn of a chat, for a new message and a restart alike. It claims the chat first, so a request that loses the race writes and pays for nothing, then stores the turn, picks the model, compacts and streams. Null when another turn holds the chat, a stop came during setup, or a restart finds nothing left to answer. */
export const startChatTurn = async (data: {
  chat: Awaited<ReturnType<typeof chatSession.ensureChat>>
  chatId: string
  payer: AiPayer
  /** Stores the new turn. A restart has none and goes on only while the transcript ends on a user turn nobody answered or stopped. */
  persistTurn?: () => Promise<unknown>
  settings: {
    context?: number
    effort?: ChatEffort
    fast?: boolean
    model?: ChatModelPick
  }
  userId: string
}) => {
  const turn = await chatStream.begin(data.chatId)
  if (!turn) {
    return null
  }
  const paidByTamery = data.payer.keys.length === 0
  const end = async () => {
    if (paidByTamery) {
      await credits.releaseStream(data.userId, data.chatId)
    }
  }
  if (paidByTamery && !(await credits.holdStream(data.userId, data.chatId))) {
    await turn.release()
    throw new ORPCError('TOO_MANY_REQUESTS', {
      message: PAID_STREAMS_BUSY_MESSAGE,
    })
  }
  try {
    const owner = { chatId: data.chatId, userId: data.userId }
    await data.persistTurn?.()
    const history = await chatPersist.loadMessages(owner)
    const last = history.at(-1)
    if (
      !data.persistTurn &&
      (last?.role !== 'user' || last.metadata?.stopped)
    ) {
      await turn.release()
      await end()
      return null
    }

    if (!data.chat.title) {
      runInBackground(
        persistChatTitle({ ...owner, messages: history, payer: data.payer })
      )
    }

    const scope = { ...owner, feature: AiFeature.Chat }
    const pick = await pickChatModel({
      effort: data.settings.effort,
      keys: data.payer.keys,
      messages: history,
      model: data.settings.model ?? AUTO_MODEL,
      onJevUsage: data.payer.recordJev(scope),
    })
    if (!pick) {
      throw new ORPCError('MODEL_UNAVAILABLE', {
        message: MODEL_UNAVAILABLE_MESSAGE,
      })
    }
    const contextTokens = resolveChatContext(pick.model, data.settings.context)
    const telemetry = data.payer.telemetry(scope)
    const stored = await chatCompaction.get(owner)
    const compaction =
      last?.role === 'user' &&
      needsCompaction(afterCompaction(history, stored), contextTokens)
        ? await chatCompaction.compact({
            ...owner,
            history,
            key: data.payer.key,
            previous: stored,
            telemetry,
          })
        : stored

    const stream = await turn.start({
      ...pick,
      contextTokens,
      fast: data.settings.fast,
      messages: afterCompaction(history, compaction),
      onFinish: async (message) => {
        await chatPersist.persistMessage({ ...owner, message })
        await end()
        const lastPart = message.parts.at(-1)
        // A step ending on a tool call is not the answer's end: the window answers it, or the change waits for Run.
        const isAnswered = !(lastPart && isToolUIPart(lastPart))
        if (!data.chat.isSubagent && !message.metadata?.stopped && isAnswered) {
          runInBackground(
            persistChatSuggestion({
              ...owner,
              history,
              message,
              payer: data.payer,
            })
          )
        }
      },
      summary: compaction?.summary,
      telemetry,
    })
    if (!stream) {
      await chatPersist.markStopped(owner)
      await end()
    }
    return stream
  } catch (error) {
    await turn.release()
    await end()
    throw error
  }
}
