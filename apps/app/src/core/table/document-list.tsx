/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a virtualized grid cannot be built from table elements */
import { uppercaseFirst } from '@tamery/shared/utils'
import type { GridRow, GridScrollerProps, ScrollToCell } from '@tamery/table'
import { GridScroller } from '@tamery/table'
import { DEFAULT_ROW_HEIGHT } from '@tamery/table/constants'
import { useVirtualizer } from '@tamery/ui/hooks/use-virtualizer'
import type { ReactNode, Ref } from 'react'
import { memo, useImperativeHandle } from 'react'

import { getDisplayValue } from '~/core/transformers/value-transformer'

import type { Column } from './cell/utils'
import { rowSelectId } from './cell/utils'
import type { DataGridCell } from './cursor'

const OVERSCAN = 4
// Keep in step with DOCUMENT_ITEM_CLASS's `pt-5` plus DOCUMENT_HEADER_CLASS's `h-8`.
const DOCUMENT_CHROME = 52

export const DOCUMENT_ITEM_CLASS = 'pt-5 data-[index=0]:pt-0'
export const DOCUMENT_HEADER_CLASS =
  'text-muted-foreground flex h-8 min-w-0 items-center gap-1 px-4 text-2xs font-semibold tracking-wider whitespace-nowrap uppercase'
export const FIELD_ROW_CLASS = 'hover:bg-accent border-b px-2'

const identityColumns = (columns: Column[]) => {
  const keys = columns.filter((column) => column.primaryKey)
  if (keys.length > 0) {
    return keys
  }
  const unique = columns.find((column) => column.unique)?.unique
  return unique ? columns.filter((column) => column.unique === unique) : []
}

interface DocumentProps {
  columns: Column[]
  identity: Column[]
  index: number
  leading?: (row: { row: GridRow; rowIndex: number }) => ReactNode
  measureElement: (node: Element | null) => void
  renderCell: (cell: DataGridCell) => ReactNode
  renderLabel?: (column: Column) => ReactNode
  row: GridRow
  /** What the engine calls a row, which heads each document. */
  rowNoun: string
}

const DocumentBase = ({
  columns,
  identity,
  index,
  leading,
  measureElement,
  renderCell,
  renderLabel,
  row,
  rowNoun,
}: DocumentProps) => {
  const label = identity
    .filter((column) => row[column.id] !== undefined)
    .map((column) => getDisplayValue(row[column.id], Number.MAX_SAFE_INTEGER))
    .join(' · ')
  return (
    <div
      ref={measureElement}
      data-index={index}
      role="row"
      className={`${DOCUMENT_ITEM_CLASS} grid grid-cols-[minmax(6rem,max-content)_minmax(0,1fr)]`}
    >
      <div
        className={`bg-background sticky top-0 z-40 col-span-2 tabular-nums ${DOCUMENT_HEADER_CLASS}`}
      >
        {leading && (
          <div className="-mx-1 flex shrink-0">
            {leading({ row, rowIndex: index })}
          </div>
        )}
        <label
          htmlFor={rowSelectId(index)}
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          {uppercaseFirst(rowNoun)} {index + 1}
          {label && (
            <span
              data-mask
              className="truncate font-normal tracking-normal normal-case"
            >
              · {label}
            </span>
          )}
        </label>
      </div>
      {columns.map((column) => (
        <div
          key={column.id}
          className={`col-span-2 grid grid-cols-subgrid ${FIELD_ROW_CLASS}`}
        >
          {renderLabel?.(column)}
          {renderCell({ column, row, rowIndex: index })}
        </div>
      ))}
    </div>
  )
}

const Document = memo(DocumentBase)

export const DocumentList = ({
  columns,
  leading,
  renderCell,
  renderLabel,
  rowNoun,
  rows,
  scrollToRef,
  ...scroller
}: GridScrollerProps & {
  columns: Column[]
  leading?: DocumentProps['leading']
  renderCell: DocumentProps['renderCell']
  renderLabel?: DocumentProps['renderLabel']
  rowNoun: string
  rows: GridRow[]
  scrollToRef?: Ref<ScrollToCell>
}) => {
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => columns.length * DEFAULT_ROW_HEIGHT + DOCUMENT_CHROME,
    getScrollElement: () => scroller.scrollRef.current,
    overscan: OVERSCAN,
  })
  useImperativeHandle(scrollToRef, () => (row) => {
    virtualizer.scrollToIndex(row, { align: 'start' })
  })

  const identity = identityColumns(columns)

  return (
    <GridScroller {...scroller} rowCount={rows.length} rows={virtualizer}>
      {virtualizer.virtualItems.map((item) => {
        const row = rows[item.index]
        return (
          row && (
            <Document
              key={item.key}
              columns={columns}
              identity={identity}
              index={item.index}
              leading={leading}
              measureElement={virtualizer.measureElement}
              renderCell={renderCell}
              renderLabel={renderLabel}
              row={row}
              rowNoun={rowNoun}
            />
          )
        )
      })}
    </GridScroller>
  )
}
