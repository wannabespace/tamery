import { v7 } from 'uuid'

import { getCollections } from '~/core/collections'
import { getConnectionResourceStore } from '~/core/connection/stores'
import { openTab } from '~/core/tabs/actions'
import { checkOrUpgrade } from '~/core/user/permissions'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'

import { getChatInstance } from './chat-instance'
import { chatDraftsValue } from './stores'
import { openSubagentStore } from './subagents-store'
import { chatTab, chatTabId } from './tab'

export const openChat = (resourceId: string, chatId: string) => {
  const tabId = openTab(resourceId, chatTabId(chatId))
  openSubagentStore(resourceId).set(null)
  history.push(`/connection/${resourceId}/${encodeURIComponent(tabId)}`)
}

const isBlankChat = (resourceId: string, chatId: string) =>
  !getCollections().chatsCollection.has(chatId) &&
  !chatDraftsValue.get()[chatId] &&
  getChatInstance({ chatId, connectionResourceId: resourceId }).messages
    .length === 0

/** Opens a fresh chat, reusing an open one nothing was written in yet; a chat with a draft stays as it is. */
export const startNewChat = (resourceId: string) => {
  if (!checkOrUpgrade('ai.chat.use')) {
    return
  }
  const blank = getConnectionResourceStore(resourceId)
    .get()
    .tabs.map((tab) => chatTab.match(tab.id)?.chatId)
    .find((chatId) => chatId && isBlankChat(resourceId, chatId))
  if (!blank) {
    posthog.capture('ai_chat_created')
  }
  openChat(resourceId, blank ?? v7())
}
