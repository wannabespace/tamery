import {
  ArrowDownLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Key01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GridRow } from '@tamery/table'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@tamery/ui/components/table'
import { cn } from '@tamery/ui/lib/utils'

import { useConnectionContext } from '~/core/connection/route'
import type { Column } from '~/core/table/cell/utils'
import { createTransformer } from '~/core/transformers/create-transformer'

import { useTableColumnsQuery } from '../../lib/columns'
import type { Hop } from './hops'
import { followReference } from './hops'

const VALUE_CHARS = 400

const isPresent = (value: unknown) => value !== null && value !== undefined

export const Display = ({
  column,
  value,
}: {
  column: Column
  value: unknown
}) => {
  const { dialect } = useConnectionContext()
  return (
    <span
      data-mask
      className={cn(!isPresent(value) && 'text-muted-foreground/60')}
    >
      {createTransformer(dialect, column).toDisplay(value, VALUE_CHARS)}
    </span>
  )
}

export const FollowList = ({
  heading,
  items,
  onFollow,
}: {
  heading: string
  items: {
    reference: NonNullable<Column['references']>[number]
    value: unknown
  }[]
  onFollow: (hop: Hop) => void
}) => (
  <section className="flex flex-col border-t p-1.5">
    <h3 className="text-muted-foreground text-2xs px-2.5 py-1 font-semibold tracking-wider uppercase">
      {heading}
    </h3>
    {items.map(({ reference, value }) => (
      <Button
        key={reference.name}
        variant="ghost"
        size="xs"
        className="justify-start"
        onClick={() => onFollow(followReference(reference, value))}
      >
        <HugeiconsIcon
          icon={ArrowDownLeft01Icon}
          strokeWidth={2}
          className="text-muted-foreground"
        />
        <span data-mask className="truncate">
          {reference.table}
          <span className="text-muted-foreground"> · {reference.column}</span>
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          strokeWidth={2}
          className="text-muted-foreground ml-auto"
        />
      </Button>
    ))}
  </section>
)

export const RecordView = ({
  onFollow,
  row,
  schema,
  table,
}: {
  onFollow: (hop: Hop) => void
  row: GridRow
  schema: string
  table: string
}) => {
  const { connectionResource } = useConnectionContext()
  const { data = [] } = useTableColumnsQuery({
    connectionResource,
    schema,
    table,
  })
  const columns: Column[] =
    data.length > 0
      ? data
      : Object.keys(row).map((id) => ({ id, uiType: 'raw' }))
  const incoming = columns.flatMap((column) =>
    isPresent(row[column.id])
      ? (column.references ?? []).map((reference) => ({
          reference,
          value: row[column.id],
        }))
      : []
  )

  return (
    <div className="flex flex-col select-text">
      <Table size="sm" className="table-fixed">
        <TableBody>
          {columns.map((column) => {
            const value = row[column.id]
            const { foreign } = column
            return (
              <TableRow key={column.id}>
                <TableCell className="w-36 truncate">
                  <span className="text-muted-foreground flex items-center gap-1">
                    {column.primaryKey && (
                      <HugeiconsIcon
                        icon={Key01Icon}
                        strokeWidth={2}
                        className="text-primary size-3 shrink-0"
                      />
                    )}
                    <span data-mask className="truncate">
                      {column.id}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      <Display column={column} value={value} />
                    </span>
                    {foreign && isPresent(value) && (
                      <IconButton
                        variant="ghost-faint-muted"
                        size="icon-2xs"
                        icon={ArrowUpRight01Icon}
                        label={`Open the ${foreign.table} row`}
                        side="bottom"
                        className="-my-1"
                        onClick={() =>
                          onFollow(followReference(foreign, value))
                        }
                      />
                    )}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {incoming.length > 0 && (
        <FollowList
          heading="Referenced by"
          items={incoming}
          onFollow={onFollow}
        />
      )}
    </div>
  )
}
