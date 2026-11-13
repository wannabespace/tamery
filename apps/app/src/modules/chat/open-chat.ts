import { v7 } from 'uuid'

import { openTab } from '~/core/tabs/actions'
import { checkOrUpgrade } from '~/core/user/permissions'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'

import { openSubagentStore } from './subagents-store'
import { chatTabId } from './tab'

export const openChat = (resourceId: string, chatId: string) => {
  const tabId = openTab(resourceId, chatTabId(chatId))
  openSubagentStore(resourceId).set(null)
  history.push(`/connection/${resourceId}/${encodeURIComponent(tabId)}`)
}

export const startNewChat = (resourceId: string) => {
  if (!checkOrUpgrade('ai.chat.use')) {
    return
  }
  posthog.capture('ai_chat_created')
  openChat(resourceId, v7())
}
