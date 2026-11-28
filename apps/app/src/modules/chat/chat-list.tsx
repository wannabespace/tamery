import { AiChat02Icon, Search01Icon } from '@hugeicons/core-free-icons'
import type { AppMessagePart } from '@tamery/ai/message'
import { matchesSearch } from '@tamery/shared/utils'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import {
  SidebarContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@tamery/ui/components/sidebar'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useParams } from '@tanstack/react-router'
import { isStaticToolUIPart } from 'ai'
import { differenceInCalendarDays } from 'date-fns'
import { Fragment, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { getCollections, useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { useNavigatorSearch } from '~/modules/navigator/keyboard'
import { NavigatorSearchField } from '~/modules/navigator/navigator-search-field'
import { getNavigatorStore } from '~/modules/navigator/stores'

import { chatActions } from './chat-actions'
import type { ChatRow, ChatStatus } from './chat-list-row'
import { ChatListRow } from './chat-list-row'
import { awaitsUser } from './chat-tool-types'
import { DeleteChatDialog } from './delete-chat-dialog'
import { RenameChatDialog } from './rename-chat-dialog'
import { chatDraftsValue, newChatIdsValue, unreadChatsValue } from './stores'
import { chatTab } from './tab'
import { isSkipped } from './tool-status'

const SKELETON_ROWS = 6

const GROUPS = [
  'Pinned',
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older',
] as const

type ChatGroup = (typeof GROUPS)[number]

const waitsOnUser = (part: AppMessagePart) =>
  awaitsUser(part) || (isStaticToolUIPart(part) && isSkipped(part))

/** Chats whose latest message holds a change waiting on the user: one to approve, or one Auto skipped, which the user's next message settles. */
const waitingChatIds = (
  rows: { chatId: string; messageId: string; part: AppMessagePart }[]
) => {
  const lastMessageId = new Map(rows.map((row) => [row.chatId, row.messageId]))
  return new Set(
    rows
      .filter(
        (row) =>
          waitsOnUser(row.part) &&
          lastMessageId.get(row.chatId) === row.messageId
      )
      .map((row) => row.chatId)
  )
}

const getGroup = (row: ChatRow): ChatGroup => {
  if (row.isPinned) {
    return 'Pinned'
  }
  const daysAgo = differenceInCalendarDays(new Date(), row.date)
  if (daysAgo <= 0) {
    return 'Today'
  }
  if (daysAgo === 1) {
    return 'Yesterday'
  }
  if (daysAgo <= 7) {
    return 'Previous 7 days'
  }
  return daysAgo <= 30 ? 'Previous 30 days' : 'Older'
}

const chatsMentioning = (search: string) => {
  if (!search.trim()) {
    return new Set<string>()
  }
  const { chatsMessagesCollection, chatsMessagesPartsCollection } =
    getCollections()
  return new Set(
    chatsMessagesPartsCollection.toArray.flatMap(({ messageId, part }) => {
      const chatId = chatsMessagesCollection.get(messageId)?.chatId
      return part.type === 'text' && chatId && matchesSearch(search, part.text)
        ? [chatId]
        : []
    })
  )
}

export const ChatList = () => {
  const { connectionResource } = useConnectionContext()
  const {
    chatsCollection,
    chatsMessagesCollection,
    chatsMessagesPartsCollection,
  } = useCollections()
  const { data: chats, isLoading } = useLiveQuery({
    query: (q) =>
      q
        .from({ chats: chatsCollection })
        .where(({ chats: chat }) =>
          eq(chat.connectionResourceId, connectionResource.id)
        )
        .orderBy(({ chats: chat }) => chat.createdAt, 'desc'),
  })
  const { data: transcriptParts } = useLiveQuery({
    query: (q) =>
      q
        .from({ messages: chatsMessagesCollection })
        .innerJoin(
          { parts: chatsMessagesPartsCollection },
          ({ messages, parts }) => eq(parts.messageId, messages.id)
        )
        .innerJoin({ chat: chatsCollection }, ({ chat, messages }) =>
          eq(messages.chatId, chat.id)
        )
        .where(({ chat }) =>
          eq(chat.connectionResourceId, connectionResource.id)
        )
        .orderBy(({ messages }) => messages.createdAt, 'asc')
        .select(({ messages, parts }) => ({
          chatId: messages.chatId,
          messageId: messages.id,
          part: parts.part,
        })),
  })
  const waiting = waitingChatIds(transcriptParts)
  const unread = useSubscription(unreadChatsValue)
  const getStatus = (chatId: string): ChatStatus | undefined => {
    if (waiting.has(chatId)) {
      return 'waiting'
    }
    return unread.includes(chatId) ? 'unread' : undefined
  }
  const { tabId } = useParams({ strict: false })
  const activeId = useSubscription(newChatIdsValue, {
    selector: () =>
      tabId ? chatTab.match(tabId, connectionResource.id)?.chatId : undefined,
  })
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<ChatRow | null>(null)
  const [renaming, setRenaming] = useState<ChatRow | null>(null)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const drafts = useSubscription(chatDraftsValue)
  const mentioning = chatsMentioning(search)

  const rows: ChatRow[] = [
    ...Object.entries(drafts)
      .filter(
        ([id, draft]) =>
          draft.resourceId === connectionResource.id &&
          !chats.some((chat) => chat.id === id)
      )
      .map(([id, draft]) => ({
        date: new Date(draft.updatedAt),
        id,
        isDraft: true,
        isPinned: false,
        title: draft.text.trim().split('\n')[0] ?? '',
      })),
    ...chats
      .filter((chat) => !chat.parentChatId)
      .map((chat) => ({
        date: chat.createdAt,
        id: chat.id,
        isDraft: false,
        isPinned: !!chat.pinnedAt,
        status: getStatus(chat.id),
        title: chat.title || 'New Chat',
      })),
  ]
    .filter((row) => matchesSearch(search, row.title) || mentioning.has(row.id))
    .toSorted((a, b) => b.date.getTime() - a.date.getTime())
  // Drafts live in this window and show at once, so before the chats load they would sit under the skeleton, and a sent chat's draft would show as a draft.
  const grouped = Object.groupBy(isLoading ? [] : rows, getGroup)
  const shown = GROUPS.flatMap((group) => grouped[group] ?? [])
  const {
    highlightedControlId,
    highlightedId,
    isSearchOpen,
    listId,
    searchProps,
  } = useNavigatorSearch({
    activeId: activeId || undefined,
    nodes: shown,
    onBack: () => getNavigatorStore(connectionResource.id).set('tables'),
    onClear: () => setSearch(''),
    search,
  })

  return (
    <>
      <NavigatorSearchField
        open={isSearchOpen}
        placeholder="Search chats"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onClear={() => setSearch('')}
        {...searchProps}
      />
      <SidebarContent
        id={listId}
        className="scroll-fade min-h-0 flex-1 pb-2 pl-2"
      >
        {isLoading && (
          <SidebarMenu>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <SidebarMenuItem key={index}>
                <SidebarMenuSkeleton seed={index} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
        {!isLoading &&
          shown.length === 0 &&
          (search ? (
            <IconEmpty
              variant="elevated"
              icon={Search01Icon}
              title="No matching chats"
              description="Try another word from the chat's title or messages."
            />
          ) : (
            <IconEmpty
              variant="elevated"
              icon={AiChat02Icon}
              title="No chats yet"
              description="Ask the AI about your data, change it, or compare it with another connection."
            />
          ))}
        <SidebarMenu data-mask>
          {GROUPS.map((group) =>
            grouped[group] ? (
              <Fragment key={group}>
                <SidebarGroupLabel className="mt-4 first:mt-0">
                  {group}
                </SidebarGroupLabel>
                {grouped[group].map((row) => (
                  <ChatListRow
                    key={row.id}
                    row={row}
                    search={search}
                    isActive={row.id === activeId}
                    isHighlighted={row.id === highlightedId}
                    controlId={
                      row.id === highlightedId
                        ? highlightedControlId
                        : undefined
                    }
                    onRename={() => {
                      setRenaming(row)
                      setIsRenameOpen(true)
                    }}
                    onDelete={() =>
                      row.isDraft
                        ? chatActions.remove(connectionResource.id, row.id)
                        : setDeleting(row)
                    }
                  />
                ))}
              </Fragment>
            ) : null
          )}
        </SidebarMenu>
      </SidebarContent>
      <RenameChatDialog
        chat={renaming}
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
      />
      <DeleteChatDialog
        chat={deleting}
        resourceId={connectionResource.id}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
