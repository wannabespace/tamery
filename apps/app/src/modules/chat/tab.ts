import { AiChat02Icon } from '@hugeicons/core-free-icons'

import { getCollections } from '~/core/collections'
import type { TabKind } from '~/core/tabs/types'

import { renameChat } from './rename-chat'

export interface ChatParams {
  chatId: string
}

export const chatTabId = (chatId: string) => `chat:${chatId}`

export const chatTab: TabKind<ChatParams> = {
  icon: () => AiChat02Icon,
  match: (id) => {
    const [kind, chatId, ...extra] = id.split(':')
    return kind === 'chat' && chatId && extra.length === 0 ? { chatId } : null
  },
  renameTitle: ({ chatId }, title) => {
    if (!getCollections().chatsCollection.has(chatId)) {
      return false
    }
    renameChat(chatId, title)
    return true
  },
  title: () => 'New chat',
  type: 'chat',
}
