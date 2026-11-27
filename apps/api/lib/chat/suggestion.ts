import { generateNextPrompt } from '@tamery/ai/features'
import type { AppUIMessage } from '@tamery/ai/message'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { chatsMessages } from '@tamery/db/schema'
import { silently } from '@tamery/shared/utils'
import { and, eq } from 'drizzle-orm'

import type { AiPayer } from '~/lib/ai-key'
import { publisher as chatsMessagesPublisher } from '~/orpc/routers/chats-messages/events'

export const persistChatSuggestion = async (data: {
  chatId: string
  history: AppUIMessage[]
  message: AppUIMessage
  payer: AiPayer
  userId: string
}) => {
  await silently(async () => {
    const suggestion = await generateNextPrompt({
      key: data.payer.key,
      messages: [...data.history, data.message],
      telemetry: data.payer.telemetry({
        chatId: data.chatId,
        feature: AiFeature.ChatSuggestion,
        userId: data.userId,
      }),
    })
    if (!suggestion) {
      return
    }

    const where = and(
      eq(chatsMessages.id, data.message.id),
      eq(chatsMessages.chatId, data.chatId),
      eq(chatsMessages.role, 'assistant')
    )
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ metadata: chatsMessages.metadata })
        .from(chatsMessages)
        .where(where)
      if (!current) {
        return null
      }
      const [value] = await tx
        .update(chatsMessages)
        .set({ metadata: { ...current.metadata, suggestion } })
        .where(where)
        .returning()
      return value
    })

    if (updated) {
      chatsMessagesPublisher.publish(data.userId, {
        type: 'update',
        value: updated,
      })
    }
  })
}
