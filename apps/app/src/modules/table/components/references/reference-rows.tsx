import { SearchRemoveIcon } from '@hugeicons/core-free-icons'
import type { GridRow } from '@tamery/table'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { Skeleton } from '@tamery/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamery/ui/components/table'
import { useHotkey } from '@tanstack/react-hotkeys'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useRef } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import { matchingRowsQueryOptions } from '~/core/queries/rows/list'
import { TableError } from '~/core/table/table-error'

import { useTableColumnsQuery } from '../../lib/columns'
import type { Hop, RowsHop } from './hops'
import { Display, RecordView } from './reference-views'

const SKELETON_ROWS = 5

const LoadingRows = () => (
  <div className="flex flex-col gap-3 p-3">
    {Array.from({ length: SKELETON_ROWS }, (_, index) => (
      <div key={index} className="flex items-center gap-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-56" />
      </div>
    ))}
  </div>
)

export const RowsView = ({
  hop,
  onFollow,
}: {
  hop: RowsHop
  onFollow: (hop: Hop) => void
}) => {
  const { connectionResource } = useConnectionContext()
  const {
    data: rows = [],
    error,
    hasNextPage,
    isPending,
  } = useInfiniteQuery(matchingRowsQueryOptions({ connectionResource, ...hop }))
  const { data: columns = [], isPending: isColumnsPending } =
    useTableColumnsQuery({
      connectionResource,
      schema: hop.schema,
      table: hop.table,
    })
  const [onlyRow] = rows
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const openRow = (row: GridRow) =>
    onFollow({
      kind: 'record',
      primaryKeys: columns.filter((c) => c.primaryKey).map((c) => c.id),
      row,
      schema: hop.schema,
      table: hop.table,
    })

  useHotkey(
    'Enter',
    (event) => {
      const index =
        event.target instanceof HTMLElement
          ? event.target.dataset.index
          : undefined
      const row = index ? rows[Number(index)] : undefined
      if (row) {
        openRow(row)
      }
    },
    { target: bodyRef }
  )

  if (isPending || isColumnsPending) {
    return <LoadingRows />
  }
  if (error) {
    return <TableError error={error} />
  }
  if (!onlyRow) {
    return (
      <IconEmpty
        icon={SearchRemoveIcon}
        title="No matching row"
        description={`Nothing in ${hop.table} has ${hop.column} = ${String(hop.value)}.`}
      />
    )
  }
  if (rows.length === 1) {
    return (
      <RecordView
        row={onlyRow}
        schema={hop.schema}
        table={hop.table}
        onFollow={onFollow}
      />
    )
  }

  const shown = columns.filter((column) => column.id !== hop.column)

  return (
    <div className="flex flex-col">
      <Table size="sm">
        <TableHeader>
          <TableRow>
            {shown.map((column) => (
              <TableHead key={column.id} className="max-w-60 truncate">
                <span data-mask>{column.id}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody ref={bodyRef}>
          {rows.map((row, index) => (
            <TableRow
              key={index}
              data-index={index}
              tabIndex={0}
              onClick={() => openRow(row)}
            >
              {shown.map((column) => (
                <TableCell key={column.id} className="max-w-60 truncate">
                  <Display column={column} value={row[column.id]} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground border-t px-4 py-2 text-xs">
        {hasNextPage
          ? `Showing the first ${rows.length} rows. Select one to see all its fields, or open the table for the rest.`
          : `${rows.length} rows. Select one to see all its fields.`}
      </p>
    </div>
  )
}
