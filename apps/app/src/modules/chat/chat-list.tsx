import {
  AiChat02Icon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { matchesSearch } from '@tamery/shared/utils'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@tamery/ui/components/sidebar'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import { useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { useNavigatorSearch } from '~/modules/navigator/keyboard'
import { QueryLoggerToggle } from '~/modules/query-logger/query-logger-toggle'

import { chatTabs } from './chat-tabs'
import { getChatStore } from './stores'

const SKELETON_ROWS = 6

/** The Navigator's list in agent mode: every chat of the resource, searchable like the tables. */
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
  const activeId = useSubscription(getChatStore(connectionResource.id))
  const [search, setSearch] = useState('')
  const shown = chats.filter((chat) =>
    matchesSearch(search, chat.title ?? 'New Chat')
  )
  const { highlightedControlId, highlightedId, listId, searchProps } =
    useNavigatorSearch({
      activeId: activeId ?? undefined,
      nodes: shown,
      onClear: () => setSearch(''),
      search,
    })

  return (
    <div className="text-foreground flex h-full flex-col pr-1.5">
      <div className="shrink-0 pt-0.5 pb-1.5 pl-2">
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
      <SidebarContent id={listId} className="min-h-0 flex-1 pl-2">
        {isLoading && (
          <SidebarMenu>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <SidebarMenuItem key={index}>
                <SidebarMenuSkeleton seed={index} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
        {!isLoading && shown.length === 0 && (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">
            {search ? 'No matching chats' : 'No chats yet'}
          </p>
        )}
        <SidebarMenu data-mask>
          {shown.map((chat) => {
            const highlighted = chat.id === highlightedId
            return (
              <SidebarMenuItem
                key={chat.id}
                data-highlighted={highlighted || undefined}
              >
                <SidebarMenuButton
                  id={highlighted ? highlightedControlId : undefined}
                  tabIndex={-1}
                  isActive={chat.id === activeId}
                  onClick={() => chatTabs.open(connectionResource.id, chat.id)}
                >
                  <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
                  <span className="truncate">{chat.title || 'New Chat'}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
      <div className="flex shrink-0 flex-col gap-0.5 pt-1.5 pb-0.5 pl-2">
        <SidebarMenuButton
          onClick={() => chatTabs.startNew(connectionResource.id)}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            className="text-muted-foreground"
          />
          New chat
        </SidebarMenuButton>
        <QueryLoggerToggle />
      </div>
    </div>
  )
}
