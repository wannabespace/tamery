import { Alert02Icon, DatabaseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChatTools } from '@tamery/ai/tools'
import { Dialect, getDialect } from '@tamery/shared/enums/connection-type'
import { DEFAULT_ROW_HEIGHT } from '@tamery/table/constants'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import { cn } from '@tamery/ui/lib/utils'
import type { CSSProperties, ReactNode } from 'react'
import { useState } from 'react'

import type { Connection } from '~/core/connection/sync'
import { getQueryLanguage } from '~/core/runtime/language'
import { ChartToggle } from '~/core/table/chart-toggle'
import { LazyResultsChart } from '~/core/table/lazy-results-chart'
import { getResultChart } from '~/core/table/result-chart'
import type { ResultChart } from '~/core/table/result-chart'
import { resultGrid } from '~/core/table/result-grid'
import { ResultsTable } from '~/core/table/results-table'
import { posthog } from '~/lib/posthog'
import { plural } from '~/utils/plural'

import { openStatement } from './app-actions'
import { Clamped } from './clamped'
import { ToolCard, ToolCardHeader } from './tool-card'

const MAX_VISIBLE_ROWS = 8

type ResultSets = ChatTools['query']['output']

const summarize = (sets: ResultSets) => {
  const set = sets.findLast(({ columns }) => columns.length > 0)
  if (set) {
    return set.truncated
      ? `${set.rows.length}+ rows`
      : plural(set.rows.length, 'row')
  }
  const counts = sets.flatMap(({ affectedRows }) =>
    affectedRows === null ? [] : [affectedRows]
  )
  // A schema change counts no rows, and "0 rows affected" would read as if it did nothing.
  if (counts.length === 0) {
    return 'Done'
  }
  return `${plural(
    counts.reduce((sum, count) => sum + count, 0),
    'row'
  )} affected`
}

export const ResultGrid = ({
  chart,
  dialect,
  grid,
}: {
  /** Set while the result shows as its chart. */
  chart: ResultChart | null
  dialect: Dialect
  grid: ReturnType<typeof resultGrid>
}) => (
  <div
    className={cn(
      'relative flex flex-col',
      chart ? 'h-56' : 'h-(--grid-height)'
    )}
    style={
      {
        '--grid-height': `${(Math.min(grid.rows.length, MAX_VISIBLE_ROWS) + 1) * DEFAULT_ROW_HEIGHT}px`,
      } as CSSProperties
    }
  >
    {chart ? (
      <LazyResultsChart chart={chart} />
    ) : (
      <ResultsTable columns={grid.columns} rows={grid.rows} dialect={dialect} />
    )}
  </div>
)

const connectionTitle = (connection: Connection, resource?: string | null) => (
  <span data-mask>
    {connection.name}
    {resource && <span className="text-muted-foreground"> / {resource}</span>}
  </span>
)

/** One statement the agent ran or wants to run: where and its state (or the decision it waits on), the SQL, then its rows or its error. */
export const StatementCard = ({
  connection,
  error,
  sets,
  statement,
  status,
  target,
}: {
  /** Null for combined results, which run in the chat's own SQLite; undefined when the call's connection is gone. */
  connection: Connection | null | undefined
  error?: string
  sets?: ResultSets
  statement: string | undefined
  /** Replaces the result's row count while the statement is not done; a pending change's decision sits here. */
  status: ReactNode
  target?: Omit<ChatTools['query']['input'], 'statement'>
}) => {
  const [asChart, setAsChart] = useState(false)
  const dialect = connection ? getDialect(connection.type) : Dialect.SQLite
  const set = sets?.findLast(({ columns }) => columns.length > 0)
  const grid = set && set.rows.length > 0 ? resultGrid(set, '') : null
  const chart = grid && getResultChart(grid.columns, grid.rows)

  return (
    <ToolCard>
      <ToolCardHeader
        icon={
          connection ? (
            <ConnectionIcon
              type={connection.type}
              provider={connection.provider}
            />
          ) : (
            <HugeiconsIcon icon={DatabaseIcon} strokeWidth={2} />
          )
        }
        title={
          connection
            ? connectionTitle(connection, target?.resource)
            : connection === null && 'Combined results'
        }
        status={status ?? (sets && summarize(sets))}
        actions={
          <>
            {chart && <ChartToggle asChart={asChart} onChange={setAsChart} />}
            {statement && (
              <CopyIconButton text={statement} label="Copy SQL" side="top" />
            )}
            {statement && target && (
              <IconButton
                icon={PlayIcon}
                label="Open in a Query tab"
                side="top"
                size="icon-xs"
                variant="ghost-muted"
                onClick={() => {
                  openStatement({ ...target, statement })
                  posthog.capture('ai_chat_statement_opened')
                }}
              />
            )}
          </>
        }
      />
      {statement && (
        <CodeBlock
          className="max-h-40"
          code={statement}
          language={getQueryLanguage(dialect).highlight}
          padding="popup"
          size="xs"
          wrap
        />
      )}
      {error && (
        <div className="flex gap-2 px-3 py-2.5 text-xs">
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="text-destructive mt-px size-3.5 shrink-0"
          />
          <div data-mask className="flex min-w-0 flex-col items-start">
            <Clamped height="short">
              <p className="whitespace-pre-wrap">{error}</p>
            </Clamped>
          </div>
        </div>
      )}
      {grid && (
        <ResultGrid
          chart={asChart ? chart : null}
          dialect={dialect}
          grid={grid}
        />
      )}
    </ToolCard>
  )
}
