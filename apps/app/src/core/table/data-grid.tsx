import type { Dialect } from '@tamery/shared/enums/connection-type'
import type { GridHeaderProps, GridRow, GridScrollerProps } from '@tamery/table'
import { useMountedEffect } from '@tamery/ui/hookas/use-mounted-effect'
import type { ReactNode, Ref, RefObject } from 'react'
import { useRef } from 'react'

import { AppContextMenu } from '~/components/app-context-menu'
import { getCapabilities } from '~/core/catalog/capabilities'

import type { CellGeometry } from './cell/cell'
import { TableCell } from './cell/cell'
import type { CellMenuExtra } from './cell/cell-menu'
import { cellMenu } from './cell/cell-menu'
import type { Column } from './cell/utils'
import type { ExtraColumn } from './column-grid'
import { ColumnGrid } from './column-grid'
import type { DataGridCell, DataGridLayout } from './cursor'
import { CursorContext } from './cursor'
import { DocumentList } from './document-list'
import type { GridBarItem } from './grid-bar'
import { GridBar } from './grid-bar'
import { useGridCursor } from './grid-cursor'
import type { DataGridHandle } from './grid-handle'
import { useGridHandle } from './grid-handle'
import { useGridHotkeys, useGridPointer } from './grid-input'
import { usePendingGridFocus } from './pending-grid-focus'

const getCellValue = ({ column, row }: DataGridCell) => row[column.id]

const columnEditable = (column: Column) => column.isEditable !== false

export const DataGrid = ({
  bar,
  canEdit = columnEditable,
  columns,
  dialect,
  cursorRef,
  focusKey,
  footer,
  getValue = getCellValue,
  isFetching,
  layout = 'grid',
  leading,
  menuItems,
  onEdit,
  onEndReached,
  onExtendRows,
  onToggleRows,
  onPreview,
  onReorder,
  pinned,
  renderCell,
  renderHeader,
  renderLabel,
  rowKey,
  rows,
  scrollRef: externalScrollRef,
  getSize,
  trailing,
}: {
  bar?: GridBarItem[]
  canEdit?: (column: Column, rowIndex: number) => boolean
  columns: Column[]
  dialect: Dialect
  cursorRef?: Ref<DataGridHandle>
  /** The grid takes focus when `focusGridWhenReady` names this key, now or once it mounts. */
  focusKey?: string
  footer?: ReactNode
  getValue?: (cell: DataGridCell) => unknown
  isFetching?: boolean
  layout?: DataGridLayout
  leading?: ExtraColumn
  menuItems?: (
    cell: DataGridCell,
    element: Element | null | undefined
  ) => CellMenuExtra
  onEdit?: (cell: DataGridCell, value: unknown) => void
  onEndReached?: () => void
  onExtendRows?: (direction: 'up' | 'down') => void
  onToggleRows?: (rowIndexes: number[]) => void
  onPreview?: (cell: DataGridCell, anchor: Element) => void
  onReorder?: (ids: string[]) => void
  /** Columns stuck to the left edge; they must lead `columns`. */
  pinned?: string[]
  renderCell?: (cell: DataGridCell, props?: CellGeometry) => ReactNode
  renderHeader?: (column: Column, props: GridHeaderProps) => ReactNode
  renderLabel?: (column: Column) => ReactNode
  /** A row's identity across inserts and refetches; without it the cursor stays on its index. */
  rowKey?: (rowIndex: number) => string
  rows: GridRow[]
  scrollRef?: RefObject<HTMLDivElement | null>
  getSize: (column: Column) => number
  trailing?: ExtraColumn
}) => {
  const ownScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = externalScrollRef ?? ownScrollRef
  const cursor = useGridCursor({
    canEdit,
    columns,
    dialect,
    getValue,
    layout,
    onEdit,
    onPreview,
    rowKey,
    rows,
    scrollRef,
  })
  const pointer = useGridPointer(cursor)
  const scrollToCell = useGridHandle({
    cursor,
    cursorRef,
    rowKey,
    rows,
    scrollRef,
  })
  const scrollToCursor = () => {
    const at = cursor.store.get().cursor
    if (at) {
      scrollToCell.current?.(at.row, at.column)
    }
  }
  useGridHotkeys({
    canEdit: !!onEdit,
    cursor,
    onExtendRows,
    onToggleRows,
    scrollRef,
    scrollToCursor,
  })
  usePendingGridFocus(focusKey, scrollRef)
  useMountedEffect(scrollToCursor, [layout])

  const renderDataCell = (cell: DataGridCell, geometry?: CellGeometry) =>
    renderCell ? (
      renderCell(cell, geometry)
    ) : (
      <TableCell
        {...geometry}
        column={cell.column}
        dialect={dialect}
        rowIndex={cell.rowIndex}
        value={getValue(cell)}
      />
    )

  const scroller: GridScrollerProps = {
    footer,
    isFetching,
    onEndReached,
    renderBody: (body) => (
      <AppContextMenu
        items={() =>
          cellMenu({
            columns: columns.map((column) => column.id),
            cursor,
            extra: menuItems,
            row: getCapabilities(dialect).names.row,
          })
        }
        render={<div {...pointer} />}
      >
        {body}
      </AppContextMenu>
    ),
    scrollRef,
  }

  return (
    <CursorContext value={cursor}>
      {layout === 'documents' ? (
        <DocumentList
          {...scroller}
          scrollToRef={scrollToCell}
          rows={rows}
          columns={columns}
          leading={leading?.renderCell}
          renderCell={renderDataCell}
          renderLabel={renderLabel}
        />
      ) : (
        <ColumnGrid
          {...scroller}
          scrollToRef={scrollToCell}
          rows={rows}
          columns={columns}
          leading={leading}
          trailing={trailing}
          pinned={pinned}
          getSize={getSize}
          onReorder={onReorder}
          renderHeader={renderHeader}
          renderCell={renderDataCell}
        />
      )}
      <GridBar cursor={cursor} items={bar} />
    </CursorContext>
  )
}
