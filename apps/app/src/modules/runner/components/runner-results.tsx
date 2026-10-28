import {
  AiIdeaIcon,
  Alert02Icon,
  FileExportIcon,
  StopIcon,
  PlayIcon,
  TableIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { NumberFlow } from '@tamery/ui/components/custom/number-flow'
import { SearchInput } from '@tamery/ui/components/custom/search-input'
import {
  createPopoverHandle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
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
import { cn } from '@tamery/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useObjectNames } from '~/core/catalog/names'
import { useTabContext } from '~/core/connection/route'
import type { ExportDataProps } from '~/core/export/export-data'
import { ExportData } from '~/core/export/export-data'
import { ShortcutKbd } from '~/core/keyboard/shortcut-kbd'
import { getQueryLanguage } from '~/core/runtime/language'
import { ChartToggle } from '~/core/table/chart-toggle'
import type { ResultChart } from '~/core/table/result-chart'
import { getResultChart } from '~/core/table/result-chart'
import { resultGrid } from '~/core/table/result-grid'
import { ResultsChart } from '~/core/table/results-chart'
import { ResultsTable } from '~/core/table/results-table'
import { useIsAnonymous } from '~/lib/auth'
import { plural } from '~/utils/plural'

import { useRunnerActions } from '../lib/actions'
import type { FailedRunnerResult, RunnerResult } from '../lib/run'
import { runnerResultsOptions } from '../lib/run'
import { useRunnerTab } from '../lib/store'

const running = (
  <div className="flex h-full flex-col items-center justify-center gap-2">
    <Spinner className="text-muted-foreground size-6" />
    <span className="text-muted-foreground text-xs">Running…</span>
  </div>
)

const ERROR_TITLES = {
  block: 'The block was rolled back',
  connection: 'The run could not start',
  statement: 'The statement failed',
}

const ResultError = ({ result }: { result: FailedRunnerResult }) => {
  const { fixWithAi } = useRunnerActions()
  const isAnonymous = useIsAnonymous()

  return (
    <IconEmpty
      icon={Alert02Icon}
      title={ERROR_TITLES[result.error.kind]}
      description={result.error.message}
    >
      {result.error.kind !== 'connection' && (
        <Tooltip shortcut={<ShortcutKbd shortcut="fixWithAi" />}>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className={isAnonymous ? 'opacity-50' : undefined}
                onClick={() => fixWithAi(result)}
              />
            }
          >
            <HugeiconsIcon icon={AiIdeaIcon} strokeWidth={2} />
            Fix with AI
          </TooltipTrigger>
          <TooltipContent>Rewrite the failed statement</TooltipContent>
        </Tooltip>
      )}
    </IconEmpty>
  )
}

const ResultBody = ({
  chart,
  result,
  columns,
  rows,
}: {
  chart: ResultChart | null
  result: RunnerResult
  columns: string[]
  rows: Record<string, unknown>[]
}) => {
  const { dialect } = useTabContext()
  const { names } = getCapabilities(dialect)

  if (result.pending) {
    return running
  }
  if (result.skipped) {
    return (
      <IconEmpty
        icon={StopIcon}
        title="Not run"
        description="An earlier statement failed, so this one did not run"
      />
    )
  }
  if (result.stopped) {
    return (
      <IconEmpty
        icon={StopIcon}
        title="Stopped"
        description="The run was stopped before this statement finished"
      />
    )
  }
  if (result.error !== null) {
    return <ResultError result={{ ...result, error: result.error }} />
  }
  if (!result.set || result.set.columns.length === 0) {
    const affected = result.set?.affectedRows ?? null
    return (
      <IconEmpty
        icon={TableIcon}
        title={
          affected === null
            ? 'Statement finished'
            : `${plural(affected, names.row)} affected`
        }
        description="The statement returned no result set"
      />
    )
  }
  if (rows.length === 0 && result.set.rows.length > 0) {
    return (
      <IconEmpty
        icon={TableIcon}
        title="Nothing matches"
        description={`No ${names.row} contains the search text`}
      />
    )
  }
  return chart ? (
    <ResultsChart chart={chart} />
  ) : (
    <ResultsTable columns={columns} rows={rows} dialect={dialect} />
  )
}

const ResultMeta = ({
  result: { duration, pending, set, stopped },
}: {
  result: RunnerResult
}) => {
  const names = useObjectNames()
  return stopped || pending ? null : (
    <span className="text-2xs text-muted-foreground flex items-center gap-1.5 tabular-nums">
      {set && set.columns.length > 0 && (
        <>
          <span>
            <NumberFlow value={set.rows.length} />
            {set.truncated && '+'}
          </span>
          {set.rows.length === 1 ? names.row : `${names.row}s`}
          <span className="text-muted-foreground/40">·</span>
        </>
      )}
      {duration.toFixed(0)} ms
    </span>
  )
}

export const RunnerResults = () => {
  const { dialect } = useTabContext()
  const { names } = getCapabilities(dialect)
  const tab = useRunnerTab()
  const { data: run } = useQuery(runnerResultsOptions(tab))
  const results = run?.results ?? []
  const [picked, setPicked] = useState({ index: 0, run: '' })
  const [search, setSearch] = useState('')
  // oxlint-disable-next-line react/hook-use-state -- a stable handle per mount, never set
  const [statementPopover] = useState(createPopoverHandle<string>)
  const activeIndex =
    picked.run === run?.id
      ? Math.min(picked.index, Math.max(0, results.length - 1))
      : 0
  const active = String(activeIndex)
  const result = results[activeIndex]
  const needle = useDeferredValue(search).trim().toLowerCase()
  const { columns, rows } = resultGrid(result?.set ?? null, needle)
  const [asChart, setAsChart] = useState(false)
  const chart = getResultChart(columns, rows)

  if (!result) {
    return (
      <div className="flex h-full flex-col">
        <IconEmpty
          icon={PlayIcon}
          title="No results yet"
          description={`Run a statement to see its ${names.row}s here`}
        />
      </div>
    )
  }

  const getData: ExportDataProps['getData'] = ({ limit }) =>
    Promise.resolve(limit ? rows.slice(0, limit) : rows)

  return (
    <Tabs
      value={active}
      onValueChange={(value) =>
        setPicked({ index: Number(value), run: run?.id ?? '' })
      }
      className="size-full"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b pr-1 pl-4">
        {results.length > 1 ? (
          <TabsList
            variant="bar"
            className="no-scrollbar -ml-4 h-full shrink-0 overflow-x-auto after:hidden data-[variant=bar]:w-auto"
          >
            {results.map((item, index) => (
              <PopoverTrigger
                key={`${item.start}:${index}`}
                handle={statementPopover}
                payload={item.source}
                openOnHover
                delay={300}
                render={
                  <TabsTrigger
                    value={String(index)}
                    className={cn(
                      'flex-none transition-none',
                      // oxlint-disable-next-line shadcn/no-restyle -- a failed statement's tab reads red
                      item.error !== null && 'text-destructive',
                      (item.stopped || item.skipped || item.pending) &&
                        // oxlint-disable-next-line shadcn/no-restyle -- a statement that never finished reads muted
                        'text-muted-foreground'
                    )}
                  />
                }
              >
                <span className="tabular-nums">{index + 1}</span>
              </PopoverTrigger>
            ))}
            <Popover handle={statementPopover}>
              {({ payload }) => (
                <PopoverContent
                  side="top"
                  align="start"
                  padding="none"
                  detached
                  className="max-w-lg min-w-64"
                >
                  {typeof payload === 'string' && (
                    <CodeBlock
                      padding="popup"
                      className="max-h-80"
                      code={payload}
                      language={getQueryLanguage(dialect).highlight}
                      size="xs"
                      wrap
                    />
                  )}
                </PopoverContent>
              )}
            </Popover>
          </TabsList>
        ) : (
          <span className="text-sm font-medium">Results</span>
        )}
        <ResultMeta result={result} />
        {run?.running && <Spinner className="text-muted-foreground size-3" />}
        <div className="ml-auto flex items-center gap-1">
          {result.set && result.set.rows.length > 0 && (
            <SearchInput
              size="xs"
              className="w-40"
              placeholder={`Search ${names.row}s`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />
          )}
          {chart && <ChartToggle asChart={asChart} onChange={setAsChart} />}
          <ExportData
            getData={getData}
            filename="runner_results"
            tooltip="Export results"
            // oxlint-disable-next-line react/no-unstable-nested-components
            trigger={({ isExporting }) => (
              <Button
                variant="ghost-muted"
                size="icon-xs"
                aria-label="Export results"
                disabled={isExporting || rows.length === 0}
              >
                <LoadingContent loading={isExporting}>
                  <HugeiconsIcon icon={FileExportIcon} strokeWidth={2} />
                </LoadingContent>
              </Button>
            )}
          />
        </div>
      </div>
      <TabsContent
        key={`${run?.id}:${active}`}
        value={active}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ResultBody
          chart={asChart ? chart : null}
          result={result}
          columns={columns}
          rows={rows}
        />
      </TabsContent>
    </Tabs>
  )
}
