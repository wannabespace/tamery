import {
  AiChat02Icon,
  Delete02Icon,
  PencilEdit01Icon,
  PinIcon,
  PinOffIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AppMessagePart } from '@tamery/ai/message'
import { matchesSearch } from '@tamery/shared/utils'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tamery/ui/components/alert-dialog'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import {
  SidebarContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@tamery/ui/components/sidebar'
import { Spinner } from '@tamery/ui/components/spinner'
import { cn } from '@tamery/ui/lib/utils'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useParams } from '@tanstack/react-router'
import { isStaticToolUIPart } from 'ai'
import { Fragment, useState, useSyncExternalStore } from 'react'
import { useSubscription } from 'seitu/react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import { getCollections, useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { useNavigatorSearch } from '~/modules/navigator/keyboard'
import { NavigatorSearchField } from '~/modules/navigator/navigator-header'
import { getNavigatorStore } from '~/modules/navigator/stores'

import { chatActions } from './chat-actions'
import { getChatInstance } from './chat-instance'
import { awaitsUser } from './chat-tool-types'
import { openChat } from './open-chat'
import { RenameChatDialog } from './rename-chat-dialog'
import { chatDraftsValue, newChatIdsValue, unreadChatsValue } from './stores'
import { chatTab } from './tab'
import { isSkipped } from './tool-status'

const SKELETON_ROWS = 6
const DAY = 24 * 60 * 60 * 1000

const GROUPS = [
  'Pinned',
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older',
] as const

type ChatGroup = (typeof GROUPS)[number]

type ChatStatus = 'failed' | 'unread' | 'waiting' | 'working'

const STATUS_DOT: Record<Exclude<ChatStatus, 'working'>, string> = {
  failed: 'bg-destructive',
  unread: 'bg-primary',
  waiting: 'bg-warning',
}

const STATUS_LABEL: Record<ChatStatus, string> = {
  failed: 'Failed',
  unread: 'New answer',
  waiting: 'Needs approval',
  working: 'Working',
}

interface ChatRow {
  date: Date
  id: string
  isDraft: boolean
  isPinned: boolean
  /** What the synced transcript says; whether this window is answering it is read live per row. */
  status?: ChatStatus
  title: string
}

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

const useLiveStatus = (chatId: string, connectionResourceId: string) => {
  const chat = getChatInstance({ chatId, connectionResourceId })
  const status = useSyncExternalStore(
    chat['~registerStatusCallback'],
    () => chat.status
  )
  if (status === 'submitted' || status === 'streaming') {
    return 'working'
  }
  return status === 'error' ? 'failed' : undefined
}

const ChatStatusMark = ({ status }: { status: ChatStatus }) => (
  <span className="ml-auto flex size-4 shrink-0 items-center justify-center group-hover/menu-item:invisible">
    <span className="sr-only">{STATUS_LABEL[status]}</span>
    {status === 'working' ? (
      <Spinner className="text-muted-foreground size-3" />
    ) : (
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
    )}
  </span>
)

const groupOf = (row: ChatRow): ChatGroup => {
  if (row.isPinned) {
    return 'Pinned'
  }
  const today = new Date().setHours(0, 0, 0, 0)
  const time = row.date.getTime()
  if (time >= today) {
    return 'Today'
  }
  if (time >= today - DAY) {
    return 'Yesterday'
  }
  if (time >= today - 7 * DAY) {
    return 'Previous 7 days'
  }
  return time >= today - 30 * DAY ? 'Previous 30 days' : 'Older'
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

const ChatListRow = ({
  controlId,
  isActive,
  isHighlighted,
  onDelete,
  onRename,
  row,
  search,
}: {
  controlId?: string
  isActive: boolean
  isHighlighted: boolean
  onDelete: () => void
  onRename: () => void
  row: ChatRow
  search: string
}) => {
  const { connectionResource } = useConnectionContext()
  const status = useLiveStatus(row.id, connectionResource.id) ?? row.status

  const items: AppMenuNode[] = [
    ...(row.isDraft
      ? []
      : [
          {
            icon: PencilEdit01Icon,
            label: 'Rename',
            onSelect: onRename,
          },
          {
            icon: row.isPinned ? PinOffIcon : PinIcon,
            label: row.isPinned ? 'Unpin' : 'Pin',
            onSelect: () => chatActions.togglePin(row.id, !row.isPinned),
          },
          { type: 'separator' as const },
        ]),
    {
      icon: Delete02Icon,
      label: row.isDraft ? 'Delete Draft' : 'Delete',
      onSelect: onDelete,
      variant: 'destructive',
    },
  ]

  return (
    <SidebarMenuItem data-highlighted={isHighlighted || undefined}>
      <AppContextMenu
        items={items}
        className="block"
        contentProps={{ className: 'min-w-48' }}
      >
        <SidebarMenuButton
          id={controlId}
          tabIndex={-1}
          isActive={isActive}
          onClick={() => openChat(connectionResource.id, row.id)}
        >
          <span className="truncate">
            <HighlightText text={row.title} match={search} />
          </span>
          {row.isDraft && (
            <span className="text-muted-foreground ml-auto shrink-0 text-xs group-hover/menu-item:invisible">
              Draft
            </span>
          )}
          {status && <ChatStatusMark status={status} />}
        </SidebarMenuButton>
        {row.isDraft ? (
          <SidebarMenuAction
            showOnHover
            tabIndex={-1}
            aria-label="Delete draft"
            className="top-1/2 -translate-y-1/2"
            onClick={onDelete}
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              className="size-3.5!"
            />
          </SidebarMenuAction>
        ) : (
          <AppMenuButton
            variant="muted"
            items={items}
            contentProps={{ className: 'min-w-48' }}
            render={
              <SidebarMenuAction
                showOnHover
                tabIndex={-1}
                aria-label="Chat actions"
                className="top-1/2 -translate-y-1/2"
              />
            }
          />
        )}
      </AppContextMenu>
    </SidebarMenuItem>
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
  const statusOf = (chatId: string): ChatStatus | undefined => {
    if (waiting.has(chatId)) {
      return 'waiting'
    }
    return unread.includes(chatId) ? 'unread' : undefined
  }
  const { tabId } = useParams({ strict: false })
  const newChatId = useSubscription(newChatIdsValue, {
    selector: (ids) => ids[connectionResource.id],
  })
  const activeParams = tabId ? chatTab.match(tabId) : null
  const activeId = activeParams && (activeParams.chatId ?? newChatId)
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
        status: statusOf(chat.id),
        title: chat.title || 'New Chat',
      })),
  ]
    .filter((row) => matchesSearch(search, row.title) || mentioning.has(row.id))
    .toSorted((a, b) => b.date.getTime() - a.date.getTime())
  // Drafts live in this window and show at once, so before the chats load they would sit under the skeleton, and a sent chat's draft would show as a draft.
  const grouped = Object.groupBy(isLoading ? [] : rows, groupOf)
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
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Delete{' '}
              <span data-mask className="font-semibold">
                {deleting?.title}
              </span>
              ? This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
            <AlertDialogCancel
              variant="destructive"
              onClick={() => {
                if (deleting) {
                  chatActions.remove(connectionResource.id, deleting.id)
                }
              }}
            >
              Delete
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
