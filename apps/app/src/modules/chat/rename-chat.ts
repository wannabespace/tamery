import { getCollections, mutateOffline } from '~/core/collections'
import { posthog } from '~/lib/posthog'

export const renameChat = (chatId: string, title: string) => {
  posthog.capture('ai_chat_renamed')
  mutateOffline(() =>
    getCollections().chatsCollection.update(chatId, (draft) => {
      draft.title = title
      draft.updatedAt = new Date()
    })
  )
}
