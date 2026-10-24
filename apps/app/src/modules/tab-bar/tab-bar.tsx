import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CancelSquareIcon,
  SidebarLeftIcon,
} from '@hugeicons/core-free-icons'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { ScrollArea } from '@tamery/ui/components/scroll-area'
import { Separator } from '@tamery/ui/components/separator'
import { cn } from '@tamery/ui/lib/utils'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from '@tanstack/react-router'
import { Reorder } from 'motion/react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { getConnectionResourceStore } from '~/core/connection/stores'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { removeTabs, updateTabs } from '~/core/tabs/actions'
import { parseTableTabId, tableTabId } from '~/core/tabs/ids'
import { resolveTab, tabLabels } from '~/core/tabs/kinds'
import { ChatToggle } from '~/modules/chat/chat-toggle'
import { toggleNavigator } from '~/modules/navigator/stores'

import { HistoryNav } from './history-nav'
import { NewTabMenu } from './new-tab-menu'
import { Tab } from './tab'
import { TabRefresh } from './tab-refresh'

export const TabBar = ({ className }: { className?: string }) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { data: tablesAndSchemas } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const { tabId: activeTabId } = useParams({ strict: false })
  const router = useRouter()
  const store = getConnectionResourceStore(connectionResource.id)
  const tabs = useSubscription(store, { selector: (state) => state.tabs })

  const tabIds = tabs.map((tab) => tab.id)

  const closeTabs = (ids: string[]) => {
    // Remove before navigating: the resource index redirects back to the active tab while it is still listed.
    removeTabs(connectionResource.id, ids)
    if (activeTabId && ids.includes(activeTabId)) {
      router.navigate({
        params: { resourceId: connectionResource.id },
        to: '/connection/$resourceId',
      })
    }
  }

  useShortcut('closeTab', () => {
    if (activeTabId) {
      closeTabs([activeTabId])
    }
  })

  const closeTabsEvent = useEffectEvent(closeTabs)

  useEffect(() => {
    closeTabsEvent(
      tabs.filter((tab) => !resolveTab(tab.id)).map((tab) => tab.id)
    )
  }, [tabs])

  const closeDroppedTableTabsEvent = useEffectEvent(
    (existingTableTabIds: Set<string>) => {
      closeTabs(
        tabIds.filter((id) => {
          const table = parseTableTabId(id)

          return (
            table &&
            !existingTableTabIds.has(tableTabId(table.schema, table.table))
          )
        })
      )
    }
  )

  useEffect(() => {
    if (!tablesAndSchemas) {
      return
    }

    closeDroppedTableTabsEvent(
      new Set(
        tablesAndSchemas.schemas.flatMap((schema) =>
          schema.tables.map((table) => tableTabId(schema.name, table.name))
        )
      )
    )
  }, [tablesAndSchemas])

  const labels = tabLabels(tabs)
  const [isDragging, setIsDragging] = useState(false)
  const stripRef = useRef<HTMLUListElement>(null)
  const tabStopId = tabIds.includes(activeTabId ?? '') ? activeTabId : tabIds[0]

  const focusSiblingTab = (delta: number) => {
    const tabButtons = [
      ...(stripRef.current?.querySelectorAll<HTMLElement>('[role=tab]') ?? []),
    ]
    const index = tabButtons.indexOf(document.activeElement as HTMLElement)
    tabButtons[index + delta]?.focus()
  }

  useHotkeys(
    [
      { callback: () => focusSiblingTab(-1), hotkey: 'ArrowLeft' },
      { callback: () => focusSiblingTab(1), hotkey: 'ArrowRight' },
    ],
    { target: stripRef }
  )

  return (
    <div
      className={cn('bg-body/50 flex h-8 shrink-0 items-stretch', className)}
    >
      <div className="flex shrink-0 items-center gap-0.5 border-r border-b px-1">
        <IconButton
          variant="ghost-muted"
          size="icon-xs"
          icon={SidebarLeftIcon}
          label="Toggle sidebar"
          side="bottom"
          shortcut={<ShortcutKbd shortcut="toggleNavigator" />}
          onClick={toggleNavigator}
        />
        <Separator orientation="vertical" className="mx-0.5 h-4!" />
        <HistoryNav />
        <TabRefresh tabId={activeTabId} />
      </div>
      {tabs.length > 0 ? (
        <ScrollArea
          viewportProps={{ tabIndex: -1 }}
          className="h-full min-w-0 flex-1"
          viewportClassName="scroll-fade-x [--scroll-fade-mask:linear-gradient(to_top,#000_1px,transparent_1px),var(--scroll-fade-inline)] [-webkit-mask-composite:source-over]! [mask-composite:add]!"
        >
          <div className="flex h-8 w-max min-w-full items-stretch">
            <Reorder.Group
              axis="x"
              values={tabs}
              onReorder={(next) => updateTabs(connectionResource.id, next)}
              ref={stripRef}
              role="tablist"
              className="flex items-stretch"
            >
              {tabs.map((tab, index) => (
                <Tab
                  key={tab.id}
                  tab={tab}
                  label={labels[index]?.label ?? ''}
                  defaultLabel={labels[index]?.defaultLabel ?? ''}
                  isActive={tab.id === activeTabId}
                  isTabStop={tab.id === tabStopId}
                  isDragging={isDragging}
                  onDragStateChange={setIsDragging}
                  connectionResource={connectionResource}
                  onClose={() => closeTabs([tab.id])}
                  closeItems={[
                    {
                      icon: Cancel01Icon,
                      label: 'Close',
                      onSelect: () => closeTabs([tab.id]),
                      shortcut: 'closeTab',
                    },
                    { type: 'separator' },
                    {
                      disabled: tabs.length <= 1,
                      icon: CancelSquareIcon,
                      label: 'Close Others',
                      onSelect: () =>
                        closeTabs(tabIds.filter((id) => id !== tab.id)),
                    },
                    {
                      disabled: index === 0,
                      icon: ArrowLeft02Icon,
                      label: 'Close to the Left',
                      onSelect: () => closeTabs(tabIds.slice(0, index)),
                    },
                    {
                      disabled: index === tabs.length - 1,
                      icon: ArrowRight02Icon,
                      label: 'Close to the Right',
                      onSelect: () => closeTabs(tabIds.slice(index + 1)),
                    },
                    { type: 'separator' },
                    {
                      icon: CancelCircleIcon,
                      label: 'Close All',
                      onSelect: () => closeTabs(tabIds),
                    },
                  ]}
                />
              ))}
            </Reorder.Group>
            <div aria-hidden className="flex-1 border-b" />
          </div>
        </ScrollArea>
      ) : (
        <div aria-hidden className="min-w-0 flex-1 border-b" />
      )}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-l px-1">
        <NewTabMenu
          connectionResource={connectionResource}
          dialect={dialect}
          tablesAndSchemas={tablesAndSchemas}
        />
        <Separator orientation="vertical" className="mx-0.5 h-4!" />
        <ChatToggle resourceId={connectionResource.id} />
      </div>
    </div>
  )
}
