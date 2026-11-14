import {
  AiChat02Icon,
  Delete02Icon,
  PencilEdit01Icon,
  PinIcon,
  PinOffIcon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import {
  SidebarContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@tamery/ui/components/sidebar'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useParams } from '@tanstack/react-router'
import { Fragment, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import { getCollections, useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { useNavigatorSearch } from '~/modules/navigator/keyboard'
import { getNavigatorStore } from '~/modules/navigator/stores'

import { chatActions } from './chat-actions'
import { openChat, startNewChat } from './open-chat'
import { chatDraftsValue } from './stores'
import { chatTab } from './tab'

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

interface ChatRow {
  date: Date
  id: string
  isDraft: boolean
  isPinned: boolean
  title: string
}

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
  row,
}: {
  controlId?: string
  isActive: boolean
  isHighlighted: boolean
  onDelete: () => void
  row: ChatRow
}) => {
  const { connectionResource } = useConnectionContext()
  const [draft, setDraft] = useState<string | null>(null)

  const commitRename = () => {
    const next = draft?.trim()
    if (next && next !== row.title) {
      chatActions.rename(row.id, next)
    }
    setDraft(null)
  }

  const items: AppMenuNode[] = [
    ...(row.isDraft
      ? []
      : [
          {
            icon: PencilEdit01Icon,
            label: 'Rename',
            onSelect: () => setDraft(row.title),
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
      {draft === null ? (
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
            <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
            <span className="truncate">{row.title}</span>
            {row.isDraft && (
              <span className="text-muted-foreground ml-auto shrink-0 text-xs group-hover/menu-item:invisible">
                Draft
              </span>
            )}
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
      ) : (
        <SidebarMenuButton isActive render={<div />}>
          <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
          <input
            autoFocus
            data-mask
            aria-label="Chat name"
            value={draft}
            className="min-w-0 flex-1 border-none bg-transparent p-0 outline-hidden"
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                commitRename()
              } else if (event.key === 'Escape') {
                event.stopPropagation()
                setDraft(null)
              }
            }}
          />
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  )
}

export const ChatList = () => {
  const { connectionResource } = useConnectionContext()
  const { chatsCollection } = useCollections()
  const { data: chats, isLoading } = useLiveQuery({
    query: (q) =>
      q
        .from({ chats: chatsCollection })
        .where(({ chats: chat }) =>
          eq(chat.connectionResourceId, connectionResource.id)
        )
        .orderBy(({ chats: chat }) => chat.createdAt, 'desc'),
  })
  const { tabId } = useParams({ strict: false })
  const activeId = tabId && chatTab.match(tabId)?.chatId
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<ChatRow | null>(null)
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
        title: chat.title || 'New Chat',
      })),
  ]
    .filter((row) => matchesSearch(search, row.title) || mentioning.has(row.id))
    .toSorted((a, b) => b.date.getTime() - a.date.getTime())
  const grouped = Object.groupBy(rows, groupOf)
  const shown = GROUPS.flatMap((group) => grouped[group] ?? [])
  const { highlightedControlId, highlightedId, listId, searchProps } =
    useNavigatorSearch({
      activeId: activeId || undefined,
      nodes: shown,
      onBack: () => getNavigatorStore(connectionResource.id).set('tables'),
      onClear: () => setSearch(''),
      search,
    })

  return (
    <>
      <div className="shrink-0 pb-1.5 pl-2">
        <SearchInput
          size="sm"
          data-mask
          placeholder="Search"
          aria-label="Search chats"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          start={
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="text-muted-foreground/70 size-3.5"
            />
          }
          {...searchProps}
        />
      </div>
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
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => startNewChat(connectionResource.id)}
              >
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                New chat
              </Button>
            </IconEmpty>
          ))}
        <SidebarMenu data-mask>
          {GROUPS.map((group) =>
            grouped[group] ? (
              <Fragment key={group}>
                <SidebarGroupLabel className="mt-2 first:mt-0">
                  {group}
                </SidebarGroupLabel>
                {grouped[group].map((row) => (
                  <ChatListRow
                    key={row.id}
                    row={row}
                    isActive={row.id === activeId}
                    isHighlighted={row.id === highlightedId}
                    controlId={
                      row.id === highlightedId
                        ? highlightedControlId
                        : undefined
                    }
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
