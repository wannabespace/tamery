import { v7 } from 'uuid'

import { posthog } from '~/lib/posthog'

import { draftChatStore, getChatStore, openChatsValue } from './stores'

/** Agent mode's tab strip: the chats open in a resource, the active one being the chat store's. `null` is the unsent draft. */
export const chatTabs = {
  close: (resourceId: string, chatId: string) => {
    const open = openChatsValue(resourceId).get()
    const rest = open.filter((id) => id !== chatId)
    openChatsValue(resourceId).set(rest)
    if (getChatStore(resourceId).get() === chatId) {
      getChatStore(resourceId).set(
        rest[Math.min(open.indexOf(chatId), rest.length - 1)] ?? null
      )
    }
  },
  open: (resourceId: string, chatId: string) => {
    openChatsValue(resourceId).set((open) =>
      open.includes(chatId) ? open : [...open, chatId]
    )
    getChatStore(resourceId).set(chatId)
  },
  startNew: (resourceId: string) => {
    posthog.capture('ai_chat_created')
    draftChatStore(resourceId).set(v7())
    getChatStore(resourceId).set(null)
  },
}
