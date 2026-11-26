import { AiChat02Icon } from '@hugeicons/core-free-icons'
import { memoize } from 'memoza'
import { v7 } from 'uuid'

import { getCollections } from '~/core/collections'
import type { TabKind } from '~/core/tabs/types'

import { renameChat } from './rename-chat'
import { newChatIdsValue, setNewChatId } from './stores'

export interface ChatParams {
  chatId: string
}

export const newChatTabId = 'chat'

export const chatTabId = (chatId: string) => `chat:${chatId}`

const unsavedNewChatId = memoize((_resourceId: string) => v7())

const getNewChatId = (resourceId: string) =>
  newChatIdsValue.get()[resourceId] ?? unsavedNewChatId(resourceId)

export const chatTab: TabKind<ChatParams> = {
  icon: () => AiChat02Icon,
  match: (id, resourceId) => {
    if (id === newChatTabId) {
      return { chatId: getNewChatId(resourceId) }
    }
    const [kind, chatId, ...extra] = id.split(':')
    return kind === 'chat' && chatId && extra.length === 0 ? { chatId } : null
  },
  onActivate: (resourceId) => {
    if (!newChatIdsValue.get()[resourceId]) {
      setNewChatId(resourceId, getNewChatId(resourceId))
    }
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
