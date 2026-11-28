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

import type { AiPayer } from '~/modules/billing/ai-key'
import { credits, PAID_CALLS_BUSY_MESSAGE } from '~/modules/billing/credits'

import { chatCompaction } from './compaction'
import { chatPersist } from './persist'
import type { chatSession } from './session'
import { persistChatSuggestion } from './suggestion'
import { persistChatTitle } from './title'

const compactFor = async ({
  contextTokens,
  ...data
}: Omit<Parameters<typeof chatCompaction.compact>[0], 'previous'> & {
  contextTokens: number
}) => {
  const stored = await chatCompaction.get(data)
  return data.history.at(-1)?.role === 'user' &&
    needsCompaction(afterCompaction(data.history, stored), contextTokens)
    ? chatCompaction.compact({ ...data, previous: stored })
    : stored
}

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
  const owner = { chatId: data.chatId, userId: data.userId }
  const paidByTamery = data.payer.keys.length === 0
  const end = async () => {
    if (paidByTamery) {
      await credits.release(data.userId, turn.id)
    }
  }
  let asked: string | undefined
  const endStopped = async () => {
    await turn.release()
    await end()
    await chatPersist.markStopped({ ...owner, messageId: asked })
    return null
  }
  try {
    if (paidByTamery && !(await credits.hold(data.userId, turn.id))) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: PAID_CALLS_BUSY_MESSAGE,
      })
    }
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
    asked = history.findLast((message) => message.role === 'user')?.id
    if (await turn.stopped()) {
      return await endStopped()
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
    if (await turn.stopped()) {
      return await endStopped()
    }
    const contextTokens = resolveChatContext(pick.model, data.settings.context)
    const telemetry = data.payer.telemetry(scope)
    const compaction = await compactFor({
      ...owner,
      contextTokens,
      history,
      key: data.payer.key,
      telemetry,
    })

    const stream = await turn.start({
      ...pick,
      connection: data.chat.connection,
      contextTokens,
      fast: data.settings.fast,
      isSubagent: data.chat.isSubagent,
      messages: afterCompaction(history, compaction),
      onFinish: async (message) => {
        try {
          await chatPersist.persistMessage({ ...owner, message })
        } finally {
          await end()
        }
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
    return stream ?? (await endStopped())
  } catch (error) {
    await turn.release()
    await end()
    throw error
  }
}
