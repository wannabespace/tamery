/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a virtualized flex grid cannot be built from table elements */
import { cn } from '@tamery/ui/lib/utils'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { CSSProperties, ReactNode } from 'react'
import { Fragment, memo } from 'react'

import type { GridColumn } from './columns'
import { columnStyle, pinnedCount } from './columns'
import type { ColumnDragHandle, useColumnDrag } from './use-column-drag'

const COLUMN_RULES = '*:not-first:not-last:border-r'
const GRID_ROW_CLASS = `group/row hover:bg-accent relative flex h-(--grid-row-height) w-full border-b contain-layout contain-style ${COLUMN_RULES}`

export type GridRow = Record<string, unknown>

export interface GridHeaderProps {
  column: GridColumn
  dragHandle: ColumnDragHandle
  isDragging: boolean
  setWidth: (width: number) => void
  style: CSSProperties
}

export interface GridCellProps {
  column: GridColumn
  isDragging: boolean
  row: GridRow
  rowIndex: number
  style: CSSProperties
}

const renderColumns = (
  columns: GridColumn[],
  virtualColumns: VirtualItem[],
  render: (column: GridColumn, index: number) => ReactNode
) => {
  const pinned = pinnedCount(columns)
  return (
    <>
      <div
        aria-hidden
        style={
          {
            '--grid-left': `${virtualColumns[0]?.start ?? 0}px`,
          } as CSSProperties
        }
        className={cn(
          'w-(--grid-left) shrink-0',
          pinned > 0 &&
            'bg-background group-hover/row:bg-accent sticky left-0 z-10'
        )}
      />
      {virtualColumns.map(({ index }, position) => {
        const column = columns[index]
        return (
          column && (
            <Fragment key={column.id}>
              {position > 0 && position === pinned && (
                <div
                  aria-hidden
                  style={
                    {
                      '--grid-gap': `${(virtualColumns[pinned]?.start ?? 0) - (virtualColumns[pinned - 1]?.end ?? 0)}px`,
                    } as CSSProperties
                  }
                  className="w-(--grid-gap) shrink-0 border-r-0!"
                />
              )}
              {render(column, index)}
            </Fragment>
          )
        )
      })}
    </>
  )
}

const CellBase = ({
  columns,
  index,
  renderCell,
  ...props
}: Omit<GridCellProps, 'style'> & {
  columns: GridColumn[]
  index: number
  renderCell: (props: GridCellProps) => ReactNode
}) => renderCell({ ...props, style: columnStyle(columns, props.column, index) })

const Cell = memo(CellBase)

type ColumnDrag = ReturnType<typeof useColumnDrag>

const HeaderBase = ({
  column,
  columns,
  handlers,
  index,
  isDragging,
  renderHeader,
  setWidth,
}: Pick<ColumnDrag, 'handlers' | 'setWidth'> & {
  column: GridColumn
  columns: GridColumn[]
  index: number
  isDragging: boolean
  renderHeader: (props: GridHeaderProps) => ReactNode
}) =>
  renderHeader({
    column,
    dragHandle: { ...handlers, 'data-grid-column': column.id },
    isDragging,
    setWidth: (width) => setWidth(column.id, width),
    style: columnStyle(columns, column, index),
  })

const Header = memo(HeaderBase)

export const HeaderRow = ({
  columns,
  drag: { dragging, handlers, setWidth },
  renderHeader,
  virtualColumns,
}: {
  columns: GridColumn[]
  drag: ColumnDrag
  renderHeader: (props: GridHeaderProps) => ReactNode
  virtualColumns: VirtualItem[]
}) => (
  <div
    role="row"
    aria-rowindex={1}
    className={`after:border-border bg-grid-surface sticky top-0 z-20 flex w-full after:absolute after:inset-x-0 after:bottom-0 after:z-20 after:border-b ${COLUMN_RULES}`}
  >
    {renderColumns(columns, virtualColumns, (column, index) => (
      <Header
        column={column}
        columns={columns}
        handlers={handlers}
        index={index}
        isDragging={dragging === column.id}
        renderHeader={renderHeader}
        setWidth={setWidth}
      />
    ))}
  </div>
)

const RowBase = ({
  columns,
  dragging,
  renderCell,
  row,
  rowIndex,
  virtualColumns,
}: {
  columns: GridColumn[]
  dragging: string | null
  renderCell: (props: GridCellProps) => ReactNode
  row: GridRow
  rowIndex: number
  virtualColumns: VirtualItem[]
}) => (
  <div role="row" aria-rowindex={rowIndex + 2} className={GRID_ROW_CLASS}>
    {renderColumns(columns, virtualColumns, (column, index) => (
      <Cell
        column={column}
        columns={columns}
        index={index}
        isDragging={dragging === column.id}
        renderCell={renderCell}
        row={row}
        rowIndex={rowIndex}
      />
    ))}
  </div>
)

export const Row = memo(RowBase)
