import {
  Delete02Icon,
  PencilEdit01Icon,
  PinIcon,
  PinOffIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@tamery/ui/components/sidebar'
import { Spinner } from '@tamery/ui/components/spinner'
import { cn } from '@tamery/ui/lib/utils'
import { useSyncExternalStore } from 'react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import { useConnectionContext } from '~/core/connection/route'

import { chatActions } from './chat-actions'
import { getChatInstance } from './chat-instance'
import { openChat } from './open-chat'

export type ChatStatus = 'failed' | 'unread' | 'waiting' | 'working'

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

export interface ChatRow {
  date: Date
  id: string
  isDraft: boolean
  isPinned: boolean
  /** What the synced transcript says; whether this window is answering it is read live per row. */
  status?: ChatStatus
  title: string
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

export const ChatListRow = ({
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
          {status && (
            <span className="ml-auto flex size-4 shrink-0 items-center justify-center group-hover/menu-item:invisible">
              <span className="sr-only">{STATUS_LABEL[status]}</span>
              {status === 'working' ? (
                <Spinner className="text-muted-foreground size-3" />
              ) : (
                <span
                  className={cn('size-1.5 rounded-full', STATUS_DOT[status])}
                />
              )}
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
    </SidebarMenuItem>
  )
}
