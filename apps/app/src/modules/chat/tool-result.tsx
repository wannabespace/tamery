import type { ChatTools } from '@tamery/ai/tools'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { DEFAULT_ROW_HEIGHT } from '@tamery/table/constants'
import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'
import { useRouter } from '@tanstack/react-router'
import { Result } from 'better-result'
import type { CSSProperties } from 'react'
import { useState } from 'react'

import { resolveTarget } from '~/core/agent/target'
import type { Connection } from '~/core/connection/sync'
import { ChartToggle } from '~/core/table/chart-toggle'
import { getResultChart } from '~/core/table/result-chart'
import { resultGrid } from '~/core/table/result-grid'
import { ResultsChart } from '~/core/table/results-chart'
import { ResultsTable } from '~/core/table/results-table'
import { posthog } from '~/lib/posthog'
import { openRunnerTab } from '~/modules/runner/lib/new-query'
import { runnerPageStore, setQuery } from '~/modules/runner/lib/store'
import { plural } from '~/utils/plural'

import { agentModeValue } from './stores'

const MAX_VISIBLE_ROWS = 8

export const ToolResult = ({
  connection,
  sets,
  target,
}: {
  connection: Connection
  sets: ChatTools['query']['output']
  target: ChatTools['query']['input']
}) => {
  const router = useRouter()
  const [asChart, setAsChart] = useState(false)
  const dialect = getDialect(connection.type)
  const resource = Result.try(() =>
    resolveTarget({
      connectionId: target.connectionId,
      resource: target.resource ?? undefined,
    })
  ).unwrapOr(null)?.resource
  const set = sets.findLast(({ columns }) => columns.length > 0)

  if (!set) {
    const affected = sets.reduce(
      (sum, { affectedRows }) => sum + (affectedRows ?? 0),
      0
    )
    return (
      <p className="text-muted-foreground pl-1.5 text-xs">
        {plural(affected, 'row')} affected
      </p>
    )
  }

  const { columns, rows } = resultGrid(set, '')
  const chart = getResultChart(columns, rows)
  const openAsQuery = () => {
    if (!resource) {
      return
    }
    const tabId = openRunnerTab(resource.id)
    setQuery(
      runnerPageStore({ dialect, resourceId: resource.id, tabId }),
      target.sql
    )
    posthog.capture('ai_chat_result_opened')
    agentModeValue.set(false)
    void router.navigate({
      params: { resourceId: resource.id, tabId },
      to: '/connection/$resourceId/$tabId',
    })
  }

  return (
    <div className="bg-background ring-foreground/4 flex flex-col overflow-hidden rounded-xl ring">
      {rows.length > 0 && (
        <div
          className={cn(
            'flex flex-col',
            asChart && chart ? 'h-56' : 'h-(--grid-height)'
          )}
          style={
            {
              '--grid-height': `${(Math.min(rows.length, MAX_VISIBLE_ROWS) + 1) * DEFAULT_ROW_HEIGHT}px`,
            } as CSSProperties
          }
        >
          {asChart && chart ? (
            <ResultsChart chart={chart} />
          ) : (
            <ResultsTable columns={columns} rows={rows} dialect={dialect} />
          )}
        </div>
      )}
      <div className="flex h-8 items-center gap-1 border-t pr-1 pl-3">
        <span className="text-muted-foreground text-xs tabular-nums">
          {plural(rows.length, 'row')}
          {set.truncated && ', more not shown'}
        </span>
        {chart && (
          <div className="ml-auto">
            <ChartToggle asChart={asChart} onChange={setAsChart} />
          </div>
        )}
        <Button
          size="xs"
          variant="ghost-muted"
          className={cn(!chart && 'ml-auto')}
          disabled={!resource}
          onClick={openAsQuery}
        >
          Open as Query
        </Button>
      </div>
    </div>
  )
}
