import { HashtagIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ActiveFilter } from '@tamery/shared/filters'
import { Button } from '@tamery/ui/components/button'
import { NumberFlow } from '@tamery/ui/components/custom/number-flow'
import { Skeleton } from '@tamery/ui/components/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTableTotalQueryOptions } from '~/core/queries/rows/total'

import { useTableColumnsContext } from '../../lib/columns'

const COMPACT_COUNT_FORMAT = {
  maximumFractionDigits: 1,
  notation: 'compact',
} as const

const CountDetails = ({
  canRequestExact,
  failed,
  total,
  updatedAt,
}: {
  canRequestExact: boolean
  failed: boolean
  total: { count: number; isEstimated: boolean } | undefined
  updatedAt: number
}) => {
  const names = useObjectNames()
  if (failed) {
    return `Couldn't count the ${names.row}s.`
  }
  if (!total) {
    return `Counting ${names.row}s…`
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span>
        {total.isEstimated ? '~' : ''}
        {total.count.toLocaleString()} {names.row}
        {total.count === 1 ? '' : 's'}
        {canRequestExact && '. Click to get the exact count.'}
      </span>
      <span className="opacity-70">
        Updated: {new Date(updatedAt).toLocaleTimeString()}
      </span>
    </div>
  )
}

export const TableStats = ({
  failed,
  filters,
  loaded,
  ready,
  schema,
  table,
}: {
  failed: boolean
  filters: ActiveFilter[]
  /** Set once every row is loaded, which makes it the exact count. */
  loaded: number | undefined
  ready: boolean
  schema: string
  table: string
}) => {
  const { connectionResource } = useConnectionContext()
  const { columns } = useTableColumnsContext()
  const [exact, setExact] = useState(false)
  const {
    data: counted,
    dataUpdatedAt,
    isFetching,
  } = useQuery({
    ...resourceTableTotalQueryOptions({
      columns,
      connectionResource,
      query: { exact, filters },
      schema,
      table,
    }),
    enabled: ready,
  })
  const total =
    loaded === undefined ? counted : { count: loaded, isEstimated: false }
  const canRequestExact = !failed && !exact && total?.isEstimated === true

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex" />}>
        <Button
          variant="outline"
          disabled={!canRequestExact}
          // oxlint-disable-next-line shadcn/no-restyle -- toolbar counters share one compact shape
          className="gap-1.5 px-2.5 disabled:opacity-100"
          onClick={() => setExact(true)}
        >
          <HugeiconsIcon
            icon={HashtagIcon}
            strokeWidth={2}
            className="text-muted-foreground/60"
          />
          <span
            className={cn(
              'text-2xs font-normal tabular-nums',
              canRequestExact &&
                'decoration-muted-foreground/50 underline decoration-dotted underline-offset-2'
            )}
          >
            {failed && <span className="text-muted-foreground">–</span>}
            {!failed && total && (
              <NumberFlow
                value={total.count}
                format={COMPACT_COUNT_FORMAT}
                className={cn(
                  'tabular-nums',
                  isFetching && 'text-muted-foreground/50 animate-pulse'
                )}
                prefix={total.isEstimated ? '~' : ''}
              />
            )}
            {!failed && !total && (
              <Skeleton className="h-2.5 w-6 rounded-full" />
            )}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <CountDetails
          canRequestExact={canRequestExact}
          failed={failed}
          total={total}
          updatedAt={dataUpdatedAt}
        />
      </TooltipContent>
    </Tooltip>
  )
}
