import { afterCompaction, compactMessages } from '@tamery/ai/features'
import type { AppUIMessage, ChatCompaction } from '@tamery/ai/message'
import type { PayingKey } from '@tamery/ai/models'
import { logProviderError } from '@tamery/ai/provider-error'
import { db } from '@tamery/db'
import { chats } from '@tamery/db/schema'
import type { TelemetryOptions } from 'ai'
import { and, eq } from 'drizzle-orm'

import { publisher as chatsPublisher } from '~/orpc/routers/chats/events'

export const chatCompaction = {
  /** Summarizes everything before the last user message into the chat's compaction, keeping the latest exchange whole so a turn in progress keeps its own messages. Returns the compaction the model should read, the previous one when there is nothing new to fold in or the summary fails. */
  compact: async (data: {
    chatId: string
    history: AppUIMessage[]
    key: PayingKey
    previous: ChatCompaction | null
    telemetry?: TelemetryOptions
    userId: string
  }) => {
    const { previous } = data
    const lastUser = data.history.findLastIndex(
      (message) => message.role === 'user'
    )
    const older = afterCompaction(
      data.history.slice(0, Math.max(lastUser, 0)),
      previous
    )
    if (older.length === 0) {
      return previous
    }
    const next = await compactMessages({
      key: data.key,
      messages: older,
      previous: previous?.summary,
      telemetry: data.telemetry,
    }).catch((error: unknown) => {
      logProviderError('chat compaction', error)
      return null
    })
    if (!next) {
      return previous
    }
    await chatCompaction.save({
      chatId: data.chatId,
      compaction: next,
      userId: data.userId,
    })
    return next
  },
  get: async (data: { chatId: string; userId: string }) => {
    const chat = await db.query.chats.findFirst({
      columns: { compaction: true },
      where: { id: { eq: data.chatId }, userId: { eq: data.userId } },
    })
    return chat?.compaction ?? null
  },
  save: async (data: {
    chatId: string
    compaction: ChatCompaction | null
    userId: string
  }) => {
    const [updated] = await db
      .update(chats)
      .set({ compaction: data.compaction })
      .where(and(eq(chats.id, data.chatId), eq(chats.userId, data.userId)))
      .returning()
    if (updated) {
      chatsPublisher.publish(data.userId, { type: 'update', value: updated })
    }
  },
}
