import { ArrowDown01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { uppercaseFirst } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useParams } from '@tanstack/react-router'
import { useSubscription } from 'seitu/react'

import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { posthog } from '~/lib/posthog'
import { startNewChat } from '~/modules/chat/open-chat'

import { createTableDialogRef } from './create-table-dialog'
import { focusSearchAfter } from './keyboard'
import type { NavigatorMode } from './stores'
import { getNavigatorStore, navigatorOpenValue } from './stores'
import { TablesRefresh } from './tables-refresh'

export const showNavigatorSection = (
  resourceId: string,
  section: NavigatorMode
) => {
  focusSearchAfter(() => {
    navigatorOpenValue.set(true)
    getNavigatorStore(resourceId).set(section)
  })
  posthog.capture('navigator_switched', { to: section })
}

export const NavigatorHeader = () => {
  const { connectionResource } = useConnectionContext()
  const { tabId } = useParams({ strict: false })
  const navigator = useSubscription(
    getNavigatorStore(connectionResource.id, tabId)
  )
  const names = useObjectNames()
  const sections = [
    {
      description: 'Browse and open your data',
      label: `${uppercaseFirst(names.table)}s`,
      shortcut: 'navigatorTables',
      value: 'tables',
    },
    {
      description: 'Indexes, constraints and the rest',
      label: 'Schema',
      shortcut: 'navigatorSchema',
      value: 'definitions',
    },
    {
      description: 'Ask AI about this database',
      label: 'Chats',
      shortcut: 'navigatorChats',
      value: 'chats',
    },
  ] as const
  const active =
    sections.find(({ value }) => value === navigator) ?? sections[0]
  const addLabel = navigator === 'chats' ? 'New chat' : `New ${names.table}`

  return (
    <div className="mb-1.5 flex h-8 shrink-0 items-center pl-2">
      <DropdownMenu>
        <Tooltip
          shortcut={sections.map(({ shortcut }) => (
            <ShortcutKbd key={shortcut} shortcut={shortcut} />
          ))}
        >
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={<Button variant="heading" size="sm" />}
              />
            }
          >
            {active.label}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              data-icon="inline-end"
              className="text-muted-foreground size-4 transition-transform group-aria-expanded/button:rotate-180"
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">Switch section</TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="min-w-48">
          {sections.map(({ description, label, shortcut, value }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => showNavigatorSection(connectionResource.id, value)}
            >
              <span className="flex flex-col">
                {label}
                <span className="text-muted-foreground text-xs">
                  {description}
                </span>
              </span>
              <DropdownMenuShortcut>
                <ShortcutKbd shortcut={shortcut} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto flex items-center">
        {navigator === 'tables' && <TablesRefresh />}
        {navigator !== 'definitions' && (
          <Tooltip
            shortcut={
              navigator === 'chats' && <ShortcutKbd shortcut="aiChat" />
            }
          >
            <TooltipTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-sm"
                  aria-label={addLabel}
                  onClick={() =>
                    navigator === 'chats'
                      ? startNewChat(connectionResource.id)
                      : createTableDialogRef.current?.create()
                  }
                />
              }
            >
              <HugeiconsIcon
                icon={PlusSignIcon}
                strokeWidth={2}
                className="size-3.5"
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">{addLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
