import {
  ArrowRight01Icon,
  Copy01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  SidebarGroupLabel,
  SidebarMenuAction,
} from '@tamery/ui/components/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { copy as copyToClipboard } from '@tamery/ui/lib/copy'
import { cn } from '@tamery/ui/lib/utils'
import { useParams } from '@tanstack/react-router'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import { parseTableTabId } from '~/core/tabs/ids'

import type { TreeRow } from './tree-row'

const useActiveTable = () => {
  const { tabId } = useParams({ strict: false })
  return tabId ? parseTableTabId(tabId) : null
}

export const SchemaRow = ({
  controlId,
  row,
  onCreateTable,
  onCreateView,
  onDrop,
  onRename,
  onToggle,
}: {
  controlId?: string
  row: Extract<TreeRow, { kind: 'schema' }>
  onCreateTable: () => void
  onCreateView: () => void
  onDrop: () => void
  onRename?: () => void
  onToggle: () => void
}) => {
  const schemaParam = useActiveTable()?.schema
  const items: AppMenuNode[] = [
    { icon: ViewIcon, label: 'New View', onSelect: onCreateView },
    { type: 'separator' },
    ...(onRename
      ? [{ icon: PencilEdit01Icon, label: 'Rename', onSelect: onRename }]
      : []),
    {
      icon: Copy01Icon,
      label: 'Copy Name',
      onSelect: () => copyToClipboard(row.name, 'Schema name copied'),
    },
    { type: 'separator' },
    {
      icon: Delete02Icon,
      label: 'Drop',
      onSelect: onDrop,
      variant: 'destructive',
    },
  ]

  return (
    <AppContextMenu
      items={items}
      className="relative block h-full"
      contentProps={{ className: 'min-w-48' }}
    >
      <SidebarGroupLabel
        render={
          <button
            id={controlId}
            type="button"
            tabIndex={-1}
            aria-label={`Toggle ${row.name} schema`}
            onClick={onToggle}
          />
        }
        // oxlint-disable-next-line shadcn/no-restyle -- page-specific: the Navigator renders the schema label as an interactive toggle row
        className="group hover:bg-foreground/5 text-foreground/70 h-full w-full gap-1 px-1.5"
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className={cn(
            `text-muted-foreground/70 size-3.5! shrink-0 transition-transform duration-150 ease-out`,
            row.open && 'rotate-90'
          )}
        />
        <span
          className={cn(
            'text-2xs truncate font-semibold tracking-wider uppercase',
            schemaParam === row.name && 'text-foreground'
          )}
        >
          {row.name}
        </span>
      </SidebarGroupLabel>
      <AppMenuButton
        variant="muted"
        items={items}
        contentProps={{ className: 'min-w-48' }}
        render={
          <SidebarMenuAction
            showOnHover
            tabIndex={-1}
            className="top-1/2 -translate-y-1/2"
          />
        }
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuAction
              showOnHover
              tabIndex={-1}
              aria-label={`New table in ${row.name}`}
              className="top-1/2 right-6 -translate-y-1/2"
              onClick={onCreateTable}
            />
          }
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            className="size-3.5!"
          />
        </TooltipTrigger>
        <TooltipContent side="right">New table</TooltipContent>
      </Tooltip>
    </AppContextMenu>
  )
}
