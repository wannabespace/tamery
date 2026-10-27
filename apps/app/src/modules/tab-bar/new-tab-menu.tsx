import { LayoutTable02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { uppercaseFirst } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
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
import { newQueryAction } from '~/modules/runner/lib/new-query'

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
  const schemas = tablesAndSchemas?.schemas ?? []
  const showSchema = schemas.length > 1
  const schemaItems = schemaGroups(dialect).flatMap((group) => group.items)

  const goToTab = (tabId: string) =>
    router.navigate({
      params: { resourceId: connectionResource.id, tabId },
      to: '/connection/$resourceId/$tabId',
    })

  useShortcut('newTab', () => setOpen(true))

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip shortcut={window.electron && <ShortcutKbd shortcut="newTab" />}>
        <TooltipTrigger
          aria-label="New tab"
          render={
            <DropdownMenuTrigger
              render={<Button variant="ghost-muted" size="icon-xs" />}
            />
          }
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        </TooltipTrigger>
        <TooltipContent side="bottom">New tab</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="max-h-[70vh] min-w-48 overflow-auto"
      >
        <DropdownMenuItem
          onClick={() => goToTab(newQueryAction.open(connectionResource.id))}
        >
          <HugeiconsIcon icon={newQueryAction.icon} strokeWidth={2} />
          {newQueryAction.label}
        </DropdownMenuItem>
        {schemaItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Schema</DropdownMenuLabel>
              {schemaItems.map(({ icon, label, tabId }) => (
                <DropdownMenuItem
                  key={tabId}
                  onClick={() => goToTab(openTab(connectionResource.id, tabId))}
                >
                  <HugeiconsIcon icon={icon} strokeWidth={2} />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        {schemas.some((schema) => schema.tables.length > 0) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {uppercaseFirst(getCapabilities(dialect).names.table)}s
              </DropdownMenuLabel>
              {schemas.flatMap((schema) =>
                schema.tables.map((table) => (
                  <DropdownMenuItem
                    key={tableTabId(schema.name, table.name)}
                    onClick={() =>
                      goToTab(
                        openTab(
                          connectionResource.id,
                          tableTabId(schema.name, table.name)
                        )
                      )
                    }
                  >
                    <HugeiconsIcon icon={LayoutTable02Icon} strokeWidth={2} />
                    <span data-mask className="truncate">
                      {showSchema ? `${schema.name}.${table.name}` : table.name}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
