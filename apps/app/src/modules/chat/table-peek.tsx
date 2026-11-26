import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tamery/ui/components/popover'
import { Skeleton } from '@tamery/ui/components/skeleton'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'

import type { TableType } from '~/core/catalog/table-type'
import { tableTypeIcon } from '~/core/catalog/table-type'
import { useConnectionContext } from '~/core/connection/route'
import { resourceRowsQueryInfiniteOptions } from '~/core/queries/rows/list'
import { openTab } from '~/core/tabs/actions'
import { tabPath, tableTabId } from '~/core/tabs/ids'
import { history } from '~/lib/last-location'
import { posthog } from '~/lib/posthog'

import { ResultGrid } from './statement-card'
import { ToolCardHeader } from './tool-card'

const PEEK_ROWS = 8

interface PeekTarget {
  schema: string
  table: string
  type: TableType
}

const PeekRows = ({ schema, table }: Omit<PeekTarget, 'type'>) => {
  const { connectionResource, dialect } = useConnectionContext()
  const {
    data: rows,
    isError,
    isPending,
  } = useInfiniteQuery(
    resourceRowsQueryInfiniteOptions({
      connectionResource,
      limit: PEEK_ROWS,
      query: {},
      schema,
      table,
    })
  )
  if (isPending) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    )
  }
  if (isError || rows.length === 0) {
    return (
      <p className="text-muted-foreground px-3 py-2.5 text-xs">
        {isError ? 'Could not read this table' : 'No rows'}
      </p>
    )
  }
  return (
    <ResultGrid
      chart={null}
      dialect={dialect}
      grid={{ columns: Object.keys(rows[0] ?? {}), rows }}
    />
  )
}

/** A table an answer names, peeked in place: its first rows, and a way into the table itself. */
export const TablePeek = ({
  target,
  trigger,
}: {
  target: PeekTarget
  trigger: ReactElement
}) => {
  const { connectionResource } = useConnectionContext()

  const open = () => {
    const tabId = tableTabId(target.schema, target.table)
    openTab(connectionResource.id, tabId)
    history.push(tabPath(connectionResource.id, tabId))
    posthog.capture('ai_chat_table_link_opened')
  }

  return (
    <Popover
      onOpenChange={(isOpen) =>
        isOpen && posthog.capture('ai_chat_table_peeked')
      }
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" padding="none" className="w-xl">
        <div className="flex flex-col divide-y [--grid-surface:var(--popover)]">
          <ToolCardHeader
            icon={
              <HugeiconsIcon
                icon={tableTypeIcon[target.type]}
                strokeWidth={2}
              />
            }
            title={<span data-mask>{target.table}</span>}
            actions={
              <Button size="xs" variant="ghost-muted" onClick={open}>
                Open table
              </Button>
            }
          />
          <PeekRows schema={target.schema} table={target.table} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
