import {
  ArrowDown02Icon,
  Cancel01Icon,
  Delete02Icon,
  File01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { previewJson } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { CodeBlock, CodeInline } from '@tamery/ui/components/custom/code-block'
import { ContentSwitch } from '@tamery/ui/components/custom/content-switch'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@tamery/ui/components/empty'
import { Spinner } from '@tamery/ui/components/spinner'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@tamery/ui/components/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useVirtualizer } from '@tamery/ui/hooks/use-virtualizer'
import { cn } from '@tamery/ui/lib/utils'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'
import { useStickToBottom } from 'use-stick-to-bottom'

import type { ConnectionResource } from '~/core/connection/sync'
import { getQueryLanguage } from '~/core/runtime/language'
import type { QueryLog } from '~/core/runtime/log'
import { getQueryLogsStore } from '~/core/runtime/log'
import { formatClockTime } from '~/utils/clock-time'
import { formatSql } from '~/utils/formatter'

import { loggerOpen } from './logger-open'

const ROW_HEIGHT = 28

const statusIndicator = ({ error, result }: QueryLog) => {
  if (error) {
    return <span className="bg-destructive size-1.5 rounded-full" />
  }

  if (result === null) {
    return <Spinner className="text-muted-foreground size-3" />
  }

  return <span className="bg-foreground/20 size-1.5 rounded-full" />
}

const StatusDot = (query: QueryLog) => (
  <span className="flex w-3 shrink-0 justify-center">
    {statusIndicator(query)}
  </span>
)

const LogRow = ({
  isActive,
  language,
  onSelect,
  query,
}: {
  isActive: boolean
  language: string
  onSelect: () => void
  query: QueryLog
}) => (
  <button
    type="button"
    aria-label="Inspect query"
    data-active={isActive || undefined}
    onClick={onSelect}
    className="hover:bg-accent data-active:bg-foreground/10 data-active:hover:bg-foreground/10 focus-visible:bg-foreground/10 data-active:focus-visible:bg-foreground/15 flex h-7 w-full items-center gap-2.5 px-3 text-left text-sm outline-none"
  >
    <StatusDot {...query} />
    <span className="min-w-0 flex-1 truncate font-mono text-xs">
      <CodeInline data-mask code={query.query} language={language} />
    </span>
    <span className="text-2xs text-muted-foreground/70 flex items-center gap-3 tabular-nums">
      <span className="w-12 text-right">
        {query.duration === null ? '' : `${Math.round(query.duration)} ms`}
      </span>
      <span>{formatClockTime(query.createdAt)}</span>
    </span>
  </button>
)

interface DetailTab {
  code: string
  label: string
  language: string
  value: string
}

const buildTabs = (query: QueryLog, dialect: Dialect) =>
  [
    {
      code: formatSql(query.query, dialect),
      label: 'Query',
      language: getQueryLanguage(dialect).highlight,
      value: 'query',
    },
    {
      code: query.error,
      label: 'Error',
      language: 'text',
      value: 'error',
    },
    {
      code: query.values.length > 0 ? previewJson(query.values) : null,
      label: 'Values',
      language: 'json',
      value: 'values',
    },
    {
      code: query.result === null ? null : previewJson(query.result),
      label: Array.isArray(query.result)
        ? `Result · ${query.result.length}`
        : 'Result',
      language: 'json',
      value: 'result',
    },
  ].filter((tab): tab is DetailTab => !!tab.code)

const QueryDetails = ({
  queryId,
  tab,
}: {
  queryId: string
  tab: DetailTab
}) => (
  <TabsContent
    key={`${queryId}-${tab.value}`}
    value={tab.value}
    className="flex min-h-0 flex-1 flex-col"
  >
    <CodeBlock
      variant={tab.value === 'error' ? 'destructive' : 'ghost'}
      // oxlint-disable-next-line shadcn/no-restyle -- the block sits flush under the tab strip
      className="no-scrollbar scroll-fade min-h-0 flex-1 pb-2"
      code={tab.code}
      language={tab.language}
      lineNumbers
    />
  </TabsContent>
)

const LogList = ({
  language,
  onSelect,
  queries,
  selectedId,
}: {
  language: string
  onSelect: (id: string) => void
  queries: QueryLog[]
  selectedId?: string
}) => {
  const { contentRef, isNearBottom, scrollRef, scrollToBottom } =
    useStickToBottom({ initial: 'instant' })
  const { totalSize, virtualItems } = useVirtualizer({
    count: queries.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollRef.current,
    overscan: 5,
  })

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        className="no-scrollbar scroll-fade h-full overflow-auto"
      >
        <div ref={contentRef}>
          <div
            className="h-(--pad-height)"
            style={
              {
                '--pad-height': `${virtualItems[0]?.start ?? 0}px`,
              } as CSSProperties
            }
          />
          {virtualItems.map((virtualItem) => {
            const query = queries[virtualItem.index]

            return query ? (
              <LogRow
                key={virtualItem.key}
                language={language}
                query={query}
                isActive={query.id === selectedId}
                onSelect={() => onSelect(query.id)}
              />
            ) : null
          })}
          <div
            className="h-(--pad-height)"
            style={
              {
                '--pad-height': `${totalSize - (virtualItems.at(-1)?.end ?? 0)}px`,
              } as CSSProperties
            }
          />
        </div>
      </div>
      <Button
        className={cn(
          `absolute inset-x-0 bottom-2 mx-auto transition-all`,
          isNearBottom && 'pointer-events-none translate-y-4 opacity-0'
        )}
        variant="outline"
        size="icon-sm"
        aria-label="Scroll to latest"
        onClick={() => scrollToBottom()}
      >
        <HugeiconsIcon
          icon={ArrowDown02Icon}
          strokeWidth={2}
          className="size-4"
        />
      </Button>
    </div>
  )
}

export const QueryLogger = ({
  className,
  connectionResource,
  dialect,
}: {
  className?: string
  connectionResource: ConnectionResource
  dialect: Dialect
}) => {
  const logsStore = getQueryLogsStore(connectionResource.id)
  const queries = useSubscription(logsStore, {
    isEqual: Object.is,
    selector: (logs: QueryLog[]) => logs,
  })
  const [selectedId, setSelectedId] = useState<string>()
  const [tab, setTab] = useState({ id: '', value: 'query' })
  const [isClearing, setIsClearing] = useState(false)
  const selected = queries.find((query) => query.id === selectedId)

  if (selected && tab.id !== selected.id) {
    setTab({ id: selected.id, value: selected.error ? 'error' : 'query' })
  }

  const tabs = selected ? buildTabs(selected, dialect) : []
  const activeTab = tabs.find((item) => item.value === tab.value) ?? tabs.at(0)

  const clearQueries = () => {
    setIsClearing(true)
    logsStore.set([])
  }

  return (
    <Tabs
      value={activeTab?.value ?? 'query'}
      onValueChange={(value) =>
        setTab((current) => ({ ...current, value: value as string }))
      }
      className={cn('flex h-full min-h-0 flex-col', className)}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b pr-1 pl-3">
        <span className="text-sm font-medium">Query Logger</span>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label="Clear log"
                  disabled={queries.length === 0}
                  onClick={clearQueries}
                />
              }
            >
              <ContentSwitch
                active={isClearing}
                onSwitchEnd={setIsClearing}
                activeContent={
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className="text-success"
                  />
                }
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </ContentSwitch>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear log</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label="Close query logger"
                  onClick={() => loggerOpen(connectionResource.id).set(false)}
                />
              }
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </TooltipTrigger>
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {queries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={File01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No queries yet</EmptyTitle>
            <EmptyDescription>
              Queries run against this connection show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <LogList
              language={getQueryLanguage(dialect).highlight}
              queries={queries}
              selectedId={selectedId}
              onSelect={(id) =>
                setSelectedId((current) => (current === id ? undefined : id))
              }
            />
          </div>
          <div
            className={cn(
              'flex w-0 shrink-0 flex-col overflow-hidden',
              selected && 'w-[55%] border-l'
            )}
          >
            {selected && activeTab && (
              <TabsList variant="bar" className="shrink-0 after:hidden">
                {tabs.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="flex-none transition-none"
                  >
                    <span className="tabular-nums">{item.label}</span>
                  </TabsTrigger>
                ))}
                <div className="flex flex-1 items-center justify-end border-b px-1">
                  <CopyIconButton
                    label={`Copy ${activeTab.label}`}
                    text={activeTab.code}
                  />
                </div>
              </TabsList>
            )}
            {selected && activeTab && (
              <QueryDetails queryId={selected.id} tab={activeTab} />
            )}
          </div>
        </div>
      )}
    </Tabs>
  )
}
