import { Alert02Icon, DatabaseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ChatTools } from '@tamery/ai/tools'
import { Dialect, getDialect } from '@tamery/shared/enums/connection-type'
import { DEFAULT_ROW_HEIGHT } from '@tamery/table/constants'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { CopyIconButton } from '@tamery/ui/components/custom/copy-button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { ConnectionIcon } from '@tamery/ui/components/icons/connection-icon'
import type { ColumnAlign } from '@tamery/ui/components/response'
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

import { Clamped } from '../messages/clamped'
import { openStatement } from '../tools/app-actions'
import { ToolCard, ToolCardHeader } from '../tools/tool-card'

const MAX_VISIBLE_ROWS = 8

type ResultSets = ChatTools['query']['output']

export const summarize = (sets: ResultSets) => {
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
  aligns,
  chart,
  dialect,
  grid,
}: {
  aligns?: ColumnAlign[]
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
      <ResultsTable
        aligns={aligns}
        columns={grid.columns}
        rows={grid.rows}
        dialect={dialect}
        resizable
      />
    )}
  </div>
)

export type StatementSource =
  | { kind: 'combined' }
  | { connection: Connection; kind: 'connection' }
  | { kind: 'missing' }

const SOURCE_TITLES = {
  combined: 'Combined results',
  missing: 'Deleted connection',
}

const SourceIcon = ({ source }: { source: StatementSource }) =>
  source.kind === 'connection' ? (
    <ConnectionIcon
      type={source.connection.type}
      provider={source.connection.provider}
    />
  ) : (
    <HugeiconsIcon icon={DatabaseIcon} strokeWidth={2} />
  )

const connectionTitle = (connection: Connection, resource?: string | null) => (
  <span data-mask>
    {connection.name}
    {resource && <span className="text-muted-foreground"> / {resource}</span>}
  </span>
)

/** One statement the agent ran or wants to run: where and its state (or the decision it waits on), the SQL, then its rows or its error. */
export const StatementCard = ({
  error,
  sets,
  source,
  statement,
  status,
  target,
}: {
  error?: string
  sets?: ResultSets
  /** Combined results run in the chat's own SQLite; a missing connection was deleted after the call. */
  source: StatementSource
  statement: string | undefined
  /** Replaces the result's row count while the statement is not done; a pending change's decision sits here. */
  status: ReactNode
  target?: Omit<ChatTools['query']['input'], 'statement'>
}) => {
  const [asChart, setAsChart] = useState(false)
  const connection = source.kind === 'connection' ? source.connection : null
  const dialect = connection ? getDialect(connection.type) : Dialect.SQLite
  const set = sets?.findLast(({ columns }) => columns.length > 0)
  const grid = set && set.rows.length > 0 ? resultGrid(set, '') : null
  const chart = grid && getResultChart(grid.columns, grid.rows)

  return (
    <ToolCard>
      <ToolCardHeader
        icon={<SourceIcon source={source} />}
        title={
          source.kind === 'connection'
            ? connectionTitle(source.connection, target?.resource)
            : SOURCE_TITLES[source.kind]
        }
        status={status ?? (sets && summarize(sets))}
        actions={
          <>
            {chart && <ChartToggle asChart={asChart} onChange={setAsChart} />}
            {statement && (
              <CopyIconButton text={statement} label="Copy SQL" side="top" />
            )}
            {statement && target && connection && (
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
