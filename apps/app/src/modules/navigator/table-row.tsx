import {
  AppWindowIcon,
  Copy01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  PinIcon,
  PinOffIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import { Indicator } from '@tamery/ui/components/custom/indicator'
import {
  SidebarMenuAction,
  SidebarMenuButton,
} from '@tamery/ui/components/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { copy as copyToClipboard } from '@tamery/ui/lib/copy'
import { cn } from '@tamery/ui/lib/utils'
import { useParams, useRouter } from '@tanstack/react-router'
import { useSubscription } from 'seitu/react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'
import { Link } from '~/components/link'
import { getCapabilities } from '~/core/catalog/capabilities'
import { getTableTypeLabel, tableTypeIcon } from '~/core/catalog/table-type'
import { useConnectionContext } from '~/core/connection/route'
import { focusGridWhenReady } from '~/core/table/pending-grid-focus'
import { tableSessionStore } from '~/core/table/session'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { checkOrUpgrade } from '~/core/user/permissions'
import { openNewWindow } from '~/utils/new-window'

import { pinnedTable } from './pinned-tables'
import {
  RowLevelSecurityMark,
  useRowLevelSecurityItems,
} from './row-level-security'
import type { TreeRow } from './tree-row'

export const TableRow = ({
  controlId,
  row,
  search,
  onRename,
  onDrop,
}: {
  controlId?: string
  row: Extract<TreeRow, { kind: 'table' }>
  search?: string
  onRename?: () => void
  onDrop: () => void
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const router = useRouter()
  const tabId = tableTabId(row.schema, row.table.name)
  const isActive = useParams({
    select: (params) => params.tabId === tabId,
    strict: false,
  })
  const Icon = tableTypeIcon[row.table.type]
  const store = tableSessionStore({
    id: connectionResource.id,
    schema: row.schema,
    table: row.table.name,
  })
  const hasDrafts = useSubscription(store, {
    selector: (state) =>
      Object.keys(state.drafts).length > 0 || state.newRows.length > 0,
  })

  const rowLevelSecurityItems = useRowLevelSecurityItems(row)

  const openInNewWindow = () => {
    if (!checkOrUpgrade('tab.multiple')) {
      return
    }

    openNewWindow(
      router.buildLocation({
        params: { resourceId: connectionResource.id, tabId },
        to: '/connection/$resourceId/$tabId',
      }).href
    )
  }

  const items: AppMenuNode[] = [
    {
      icon: AppWindowIcon,
      label: 'Open in New Window',
      onSelect: openInNewWindow,
    },
    { type: 'separator' },
    {
      icon: Copy01Icon,
      label: 'Copy Name',
      onSelect: () => copyToClipboard(row.table.name, 'Table name copied'),
    },
    {
      icon: row.pinned ? PinOffIcon : PinIcon,
      label: row.pinned ? 'Unpin' : 'Pin',
      onSelect: () =>
        pinnedTable.toggle(connectionResource.id, row.schema, row.table.name),
    },
    { type: 'separator' },
    ...(onRename
      ? [{ icon: PencilEdit01Icon, label: 'Rename', onSelect: onRename }]
      : []),
    ...rowLevelSecurityItems,
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
      className="block h-full"
      contentProps={{ className: 'min-w-48' }}
    >
      <SidebarMenuButton
        isActive={isActive}
        // oxlint-disable-next-line shadcn/no-restyle -- page-specific: a pinned row reserves label space for the overlaid pin control
        className={cn(row.pinned && 'pr-12')}
        render={
          <Link
            id={controlId}
            tabIndex={-1}
            to="/connection/$resourceId/$tabId"
            params={{
              resourceId: connectionResource.id,
              tabId,
            }}
            preload="intent"
            preloadDelay={200}
            data-mask
            onClick={(event) => {
              openTab(connectionResource.id, tabId, true)
              focusGridWhenReady(tabId, event.currentTarget)
            }}
            onDoubleClick={() => openTab(connectionResource.id, tabId)}
          />
        }
      >
        <Tooltip>
          <TooltipTrigger render={<span className="relative shrink-0" />}>
            <HugeiconsIcon
              icon={Icon}
              strokeWidth={2}
              className="text-primary/75"
            />
            {hasDrafts && (
              <Indicator className="-top-0.5 -right-0.5 size-1.5" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {getTableTypeLabel(dialect, row.table.type)}
          </TooltipContent>
        </Tooltip>
        <span
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1',
            !row.pinned && 'group-hover/menu-item:row-actions-fade'
          )}
        >
          <span className="truncate">
            <HighlightText text={row.table.name} match={search} />
          </span>
          {row.table.rowLevelSecurity && <RowLevelSecurityMark />}
        </span>
      </SidebarMenuButton>
      <AppMenuButton
        variant="muted"
        items={items}
        contentProps={{ className: 'min-w-48' }}
        render={<SidebarMenuAction showOnHover tabIndex={-1} />}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarMenuAction
              showOnHover={!row.pinned}
              tabIndex={-1}
              aria-label={`${row.pinned ? 'Unpin' : 'Pin'} ${getCapabilities(dialect).names.table}`}
              className="group/pin right-6"
              onClick={() =>
                pinnedTable.toggle(
                  connectionResource.id,
                  row.schema,
                  row.table.name
                )
              }
            />
          }
        >
          {row.pinned ? (
            <>
              <HugeiconsIcon
                icon={PinIcon}
                strokeWidth={2}
                className="text-primary size-3! group-hover/pin:hidden"
              />
              <HugeiconsIcon
                icon={PinOffIcon}
                strokeWidth={2}
                className="text-foreground hidden size-3! group-hover/pin:block"
              />
            </>
          ) : (
            <HugeiconsIcon
              icon={PinIcon}
              strokeWidth={2}
              className="text-muted-foreground group-hover/pin:text-foreground size-3!"
            />
          )}
        </TooltipTrigger>
        <TooltipContent side="right">
          {row.pinned ? 'Unpin' : 'Pin'}
        </TooltipContent>
      </Tooltip>
    </AppContextMenu>
  )
}
