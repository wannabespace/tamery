import { getCollections, mutateOffline } from '~/core/collections'
import { removeTabs } from '~/core/tabs/actions'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'

import { renameChat } from './rename-chat'
import { setChatDraft } from './stores'
import { chatTabId } from './tab'

export const chatActions = {
  remove: (resourceId: string, chatId: string) => {
    posthog.capture('ai_chat_deleted')
    const isShown =
      decodeURIComponent(history.location.pathname) ===
      `/connection/${resourceId}/${chatTabId(chatId)}`
    // Remove before navigating: the resource index redirects back to the active tab while it is still listed.
    removeTabs(resourceId, [chatTabId(chatId)])
    if (isShown) {
      history.push(`/connection/${resourceId}`)
    }
    setChatDraft(chatId, resourceId, '')
    const { chatsCollection } = getCollections()
    if (chatsCollection.has(chatId)) {
      mutateOffline(() => chatsCollection.delete(chatId))
    }
  },
  rename: renameChat,
  togglePin: (chatId: string, pinned: boolean) => {
    posthog.capture('ai_chat_pinned', { pinned })
    mutateOffline(() =>
      getCollections().chatsCollection.update(chatId, (draft) => {
        draft.pinnedAt = pinned ? new Date() : null
        draft.updatedAt = new Date()
      })
    )
  },
}
