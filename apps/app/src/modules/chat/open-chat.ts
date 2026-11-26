import { valueToText } from '@tamery/shared/value-text'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useSubscription } from 'seitu/react'
import { v7 } from 'uuid'

import { getCollections, useCollections } from '~/core/collections'
import { openTab } from '~/core/tabs/actions'
import { tabPath } from '~/core/tabs/ids'
import { checkOrUpgrade } from '~/core/user/permissions'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'

import { getChatInstance } from './chat-instance'
import {
  chatDraftsValue,
  composerFocusRequestStore,
  newChatIdsValue,
  setChatDraft,
  setNewChatId,
} from './stores'
import { openSubagentStore } from './subagents-store'
import { chatTabId, newChatTabId } from './tab'

export const openChat = (resourceId: string, chatId: string) => {
  const tabId = openTab(
    resourceId,
    chatId === newChatIdsValue.get()[resourceId]
      ? newChatTabId
      : chatTabId(chatId)
  )
  openSubagentStore(resourceId).set(null)
  history.push(tabPath(resourceId, tabId))
}

const isBlankChat = (resourceId: string, chatId: string) =>
  !getCollections().chatsCollection.has(chatId) &&
  !chatDraftsValue.get()[chatId] &&
  getChatInstance({ chatId, connectionResourceId: resourceId }).messages
    .length === 0

/** Opens the resource's unsent chat, starting a fresh one unless nothing was written in it yet; a draft stays listed under its own id. */
export const startNewChat = (resourceId: string) => {
  if (!checkOrUpgrade('ai.chat.use')) {
    return
  }
  let chatId = newChatIdsValue.get()[resourceId]
  if (!chatId || !isBlankChat(resourceId, chatId)) {
    posthog.capture('ai_chat_created')
    chatId = v7()
    setNewChatId(resourceId, chatId)
  }
  openChat(resourceId, chatId)
  composerFocusRequestStore.set((count) => count + 1)
}

export const useIsBlankChatOpen = (resourceId: string, tabId?: string) => {
  const { chatsCollection } = useCollections()
  const chatId = useSubscription(newChatIdsValue, {
    selector: (ids) => ids[resourceId] ?? null,
  })
  const hasDraft = useSubscription(chatDraftsValue, {
    selector: (drafts) => chatId !== null && !!drafts[chatId],
  })
  const { data: saved } = useLiveQuery(
    (q) =>
      chatId === null
        ? null
        : q
            .from({ chat: chatsCollection })
            .where(({ chat }) => eq(chat.id, chatId))
            .findOne(),
    [chatId]
  )
  return tabId === newChatTabId && !hasDraft && !saved
}

const DRAFT_TEXT_LIMIT = 4000

const openDraftedChat = (
  resourceId: string,
  event: 'ai_chat_error_asked' | 'ai_chat_row_asked',
  draft: string
) => {
  if (!checkOrUpgrade('ai.chat.use')) {
    return
  }
  posthog.capture(event)
  const chatId = v7()
  setNewChatId(resourceId, chatId)
  setChatDraft(chatId, resourceId, draft)
  openChat(resourceId, chatId)
}

/** Opens a new chat with the row already in the composer, for the user to finish the question. */
export const askAboutRow = (data: {
  resourceId: string
  row: Record<string, unknown>
  schema: string
  table: string
}) =>
  openDraftedChat(
    data.resourceId,
    'ai_chat_row_asked',
    `About this row of ${data.schema}.${data.table}: ${valueToText(data.row).slice(0, DRAFT_TEXT_LIMIT)}\n`
  )

/** Opens a new chat with the failure already in the composer, for the user to send or finish. */
export const askAboutError = (data: {
  message: string
  resourceId: string
  schema: string
  table: string
}) =>
  openDraftedChat(
    data.resourceId,
    'ai_chat_error_asked',
    `Why does ${data.schema}.${data.table} fail to load? ${data.message.slice(0, DRAFT_TEXT_LIMIT)}\n`
  )
