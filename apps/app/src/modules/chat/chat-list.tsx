import {
  AiChat02Icon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { matchesSearch } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@tamery/ui/components/sidebar'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { useCollections } from '~/core/collections'
import { useConnectionContext } from '~/core/connection/route'
import { useNavigatorSearch } from '~/modules/navigator/keyboard'
import { getNavigatorStore } from '~/modules/navigator/stores'

import { openChat, startNewChat } from './open-chat'
import { chatTab } from './tab'

const SKELETON_ROWS = 6

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
  const shown = chats.filter(
    (chat) =>
      !chat.parentChatId && matchesSearch(search, chat.title ?? 'New Chat')
  )
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
              description="Try another word from the chat's title."
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
                  onClick={() => openChat(connectionResource.id, chat.id)}
                >
                  <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
                  <span className="truncate">{chat.title || 'New Chat'}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
    </>
  )
}
