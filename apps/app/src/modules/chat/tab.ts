import { AiChat02Icon } from '@hugeicons/core-free-icons'
import { v7 } from 'uuid'

import { getCollections } from '~/core/collections'
import type { TabKind } from '~/core/tabs/types'

import { renameChat } from './rename-chat'
import { newChatIdsValue, setNewChatId } from './stores'

export interface ChatParams {
  /** Null for the resource's unsent chat, whose id stays out of the URL until its first message. */
  chatId: string | null
}

export const newChatTabId = 'chat'

export const chatTabId = (chatId: string) => `chat:${chatId}`

export const chatTab: TabKind<ChatParams> = {
  icon: () => AiChat02Icon,
  match: (id) => {
    if (id === newChatTabId) {
      return { chatId: null }
    }
    const [kind, chatId, ...extra] = id.split(':')
    return kind === 'chat' && chatId && extra.length === 0 ? { chatId } : null
  },
  onActivate: (resourceId, { chatId }) => {
    if (!chatId && !newChatIdsValue.get()[resourceId]) {
      setNewChatId(resourceId, v7())
    }
  },
  renameTitle: ({ chatId }, title) => {
    if (!chatId || !getCollections().chatsCollection.has(chatId)) {
      return false
    }
    renameChat(chatId, title)
    return true
  },
  title: () => 'New chat',
  type: 'chat',
}
