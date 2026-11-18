import {
  AiChat02Icon,
  LayoutTable02Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { uppercaseFirst } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  defaultFilter,
} from '@tamery/ui/components/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { ConnectionResource } from '~/core/connection/sync'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { schemaGroups } from '~/core/tabs/kinds'
import { startNewChat } from '~/modules/chat/open-chat'
import { newQueryAction } from '~/modules/runner/lib/new-query'

// A database can hold thousands of tables, and rendering them all freezes the window.
const MAX_TABLES = 50

interface TablesAndSchemas {
  schemas: { name: string; tables: { name: string }[] }[]
}

export const NewTabMenu = ({
  connectionResource,
  dialect,
  tablesAndSchemas,
}: {
  connectionResource: ConnectionResource
  dialect: Dialect
  tablesAndSchemas: TablesAndSchemas | undefined
}) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  if (!open && search) {
    setSearch('')
  }
  const schemas = tablesAndSchemas?.schemas ?? []
  const showSchema = schemas.length > 1
  const matches = (value: string, keywords?: string[]) =>
    !search.trim() || defaultFilter(value, search, keywords) > 0
  const schemaItems = schemaGroups(dialect)
    .flatMap((group) => group.items)
    .filter((item) => matches(item.label))
  const tables = schemas
    .flatMap((schema) =>
      schema.tables.map((table) => ({
        label: showSchema ? `${schema.name}.${table.name}` : table.name,
        schema: schema.name,
        table: table.name,
      }))
    )
    .filter((table) => matches(table.label, [table.schema, table.table]))
    .slice(0, MAX_TABLES)

  const goToTab = (tabId: string) => {
    setOpen(false)
    router.navigate({
      params: { resourceId: connectionResource.id, tabId },
      to: '/connection/$resourceId/$tabId',
    })
  }
  const newQuery = () => goToTab(newQueryAction.open(connectionResource.id))
  const newChat = () => {
    setOpen(false)
    startNewChat(connectionResource.id)
  }

  useShortcut('newTab', () => setOpen(true))
  useShortcut('newQuery', (event) => {
    event.preventDefault()
    newQuery()
  })
  useShortcut('aiChat', (event) => {
    event.preventDefault()
    startNewChat(connectionResource.id)
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip shortcut={window.electron && <ShortcutKbd shortcut="newTab" />}>
        <TooltipTrigger
          aria-label="New tab"
          render={
            <PopoverTrigger
              render={<Button variant="ghost-muted" size="icon-xs" />}
            />
          }
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        </TooltipTrigger>
        <TooltipContent side="bottom">New tab</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" padding="none" className="w-72">
        <Command loop shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${getCapabilities(dialect).names.table}s`}
            value={search}
            onValueChange={setSearch}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup>
              {matches(newQueryAction.label, newQueryAction.keywords) && (
                <CommandItem value={newQueryAction.label} onSelect={newQuery}>
                  <HugeiconsIcon icon={newQueryAction.icon} strokeWidth={2} />
                  {newQueryAction.label}
                  <CommandShortcut>
                    <ShortcutKbd shortcut="newQuery" />
                  </CommandShortcut>
                </CommandItem>
              )}
              {matches('New chat') && (
                <CommandItem value="New chat" onSelect={newChat}>
                  <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
                  New chat
                  <CommandShortcut>
                    <ShortcutKbd shortcut="aiChat" />
                  </CommandShortcut>
                </CommandItem>
              )}
            </CommandGroup>
            {schemaItems.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Schema">
                  {schemaItems.map(({ icon, label, tabId }) => (
                    <CommandItem
                      key={tabId}
                      value={label}
                      onSelect={() =>
                        goToTab(openTab(connectionResource.id, tabId))
                      }
                    >
                      <HugeiconsIcon icon={icon} strokeWidth={2} />
                      {label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {tables.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup
                  heading={`${uppercaseFirst(getCapabilities(dialect).names.table)}s`}
                >
                  {tables.map((table) => {
                    const tabId = tableTabId(table.schema, table.table)
                    return (
                      <CommandItem
                        key={tabId}
                        value={tabId}
                        onSelect={() =>
                          goToTab(openTab(connectionResource.id, tabId))
                        }
                      >
                        <HugeiconsIcon
                          icon={LayoutTable02Icon}
                          strokeWidth={2}
                        />
                        <span data-mask className="truncate">
                          {table.label}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
