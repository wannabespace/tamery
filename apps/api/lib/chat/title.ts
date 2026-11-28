import { generateChatTitle } from '@tamery/ai/features'
import type { AppUIMessage } from '@tamery/ai/message'
import { logProviderError } from '@tamery/ai/provider-error'
import { AiFeature } from '@tamery/ai/usage'
import { db } from '@tamery/db'
import { chats } from '@tamery/db/schema'
import { redactSecrets } from '@tamery/shared/sanitize-log'
import { and, eq, isNull } from 'drizzle-orm'

import type { AiPayer } from '~/lib/ai-key'
import { publisher as chatsPublisher } from '~/orpc/routers/chats/events'

export const persistChatTitle = async (data: {
  chatId: string
  messages: AppUIMessage[]
  payer: AiPayer
  userId: string
}) => {
  try {
    const title = await generateChatTitle({
      key: data.payer.key,
      messages: data.messages,
      telemetry: data.payer.telemetry({
        chatId: data.chatId,
        feature: AiFeature.ChatTitle,
        userId: data.userId,
      }),
    })
    if (!title) {
      return
    }

    const [updated] = await db
      .update(chats)
      // A title summarizing a pasted connection string would carry its password into every chat list.
      .set({ title: redactSecrets(title) })
      .where(
        and(
          eq(chats.id, data.chatId),
          eq(chats.userId, data.userId),
          isNull(chats.title)
        )
      )
      .returning()

    if (updated) {
      chatsPublisher.publish(data.userId, { type: 'update', value: updated })
    }
  } catch (error) {
    logProviderError(`chat title ${data.chatId}`, error)
  }
}
