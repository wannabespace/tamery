/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a virtualized flex grid cannot be built from table elements */
import type {
  GridColumn,
  GridHeaderProps,
  GridRow,
  GridScrollerProps,
  ScrollToCell,
} from '@tamery/table'
import { Grid } from '@tamery/table'
import type { CSSProperties, ReactNode, Ref } from 'react'

import type { CellGeometry } from './cell/cell'
import type { Column } from './cell/utils'
import type { DataGridCell } from './cursor'

export interface ExtraColumn {
  id: string
  renderCell: (props: {
    row: GridRow
    rowIndex: number
    style?: CSSProperties
  }) => ReactNode
  renderHeader: (props: GridHeaderProps) => ReactNode
  size: number
}

const PlainHeader = (
  column: Column,
  { dragHandle, style }: GridHeaderProps
) => (
  <div
    role="columnheader"
    style={style}
    className="flex min-h-8 min-w-0 flex-col justify-center px-2 py-1.5 select-none"
    {...dragHandle}
  >
    <div data-mask className="truncate text-xs font-medium">
      {column.id}
    </div>
    {column.typeLabel && (
      <div className="text-muted-foreground text-2xs truncate leading-4">
        {column.typeLabel}
      </div>
    )}
  </div>
)

export const ColumnGrid = ({
  columns,
  leading,
  onReorder,
  pinned,
  renderCell,
  renderHeader = PlainHeader,
  rows,
  scrollToRef,
  getSize,
  trailing,
  ...scroller
}: GridScrollerProps & {
  columns: Column[]
  leading?: ExtraColumn
  onReorder?: (ids: string[]) => void
  pinned?: string[]
  renderCell: (cell: DataGridCell, geometry: CellGeometry) => ReactNode
  renderHeader?: (column: Column, props: GridHeaderProps) => ReactNode
  rows: GridRow[]
  scrollToRef?: Ref<ScrollToCell>
  getSize: (column: Column) => number
  trailing?: ExtraColumn
}) => {
  const byId = new Map(columns.map((column) => [column.id, column]))
  const extras = new Map(
    [leading, trailing].flatMap((extra) => (extra ? [[extra.id, extra]] : []))
  )
  const gridColumns: GridColumn[] = [
    ...(leading ? [{ id: leading.id, pinned: true, size: leading.size }] : []),
    ...columns.map((column) => ({
      id: column.id,
      pinned: !!pinned?.includes(column.id),
      size: getSize(column),
    })),
    ...(trailing
      ? [{ fixed: true, id: trailing.id, size: trailing.size }]
      : []),
  ]

  return (
    <Grid
      {...scroller}
      scrollToRef={scrollToRef}
      rows={rows}
      columns={gridColumns}
      onReorder={onReorder}
      renderHeader={(props) => {
        const column = byId.get(props.column.id)
        return column
          ? renderHeader(column, props)
          : extras.get(props.column.id)?.renderHeader(props)
      }}
      renderCell={(props) => {
        const column = byId.get(props.column.id)
        return column
          ? renderCell(
              { column, row: props.row, rowIndex: props.rowIndex },
              {
                isDragging: props.isDragging,
                pinned: props.column.pinned,
                size: props.column.size,
                style: props.style,
              }
            )
          : extras.get(props.column.id)?.renderCell(props)
      }}
    />
  )
}
