import { ArrowDown02Icon, ArrowUp02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GridHeaderProps } from '@tamery/table'
import { ARIA_SORT, isHeaderPress } from '@tamery/table'
import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'
import type { RefObject } from 'react'
import { useRef } from 'react'
import { useSubscription } from 'seitu/react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a virtualized flex grid cannot be built from table elements */
import { useObjectNames } from '~/core/catalog/names'
import type { Column } from '~/core/table/cell/utils'
import { ColumnResizeHandle } from '~/core/table/column-resize-handle'
import { useGridCursorContext } from '~/core/table/cursor'
import {
  labelCandidates,
  useReferencedColumns,
} from '~/core/table/referenced-columns'
import { posthog } from '~/lib/posthog'

import type { ColumnActions } from '../../lib/column-menu'
import { columnMenuItems } from '../../lib/column-menu'
import { getLabelColumn } from '../../lib/labels'
import { columnLayout, columnsOrder, useTablePageStore } from '../../lib/store'
import { ColumnHeading } from './column-type'

const useColumnMenu = (
  column: Column,
  anchor: RefObject<HTMLDivElement | null>,
  actions: ColumnActions
) => {
  const store = useTablePageStore()
  const order = useSubscription(store, {
    selector: (state) => state.orderBy[column.id] ?? null,
  })
  const storedLabel = useSubscription(store, {
    selector: (state) => state.columnLabels[column.id],
  })
  const referenced = useReferencedColumns([column]).get(column.id) ?? []
  const foreignColumn = column.foreign?.column ?? ''
  const items = () =>
    columnMenuItems({
      ...actions,
      anchor: anchor.current,
      column,
      labels: column.foreign
        ? {
            columns: labelCandidates(referenced, foreignColumn).map(
              ({ id }) => id
            ),
            current: getLabelColumn(storedLabel, referenced, foreignColumn),
          }
        : undefined,
      store,
    })

  const cycleOrder = (addToSort: boolean) => {
    columnsOrder(store).cycleOrder(column.id, addToSort)
    posthog.capture('column_sort_cycled', {
      add_to_sort: addToSort,
      order: store.get().orderBy[column.id] ?? 'none',
    })
  }

  return { cycleOrder, items, layout: columnLayout(store), order }
}

const SortArrow = ({ order }: { order: 'ASC' | 'DESC' }) => (
  <HugeiconsIcon
    icon={order === 'ASC' ? ArrowUp02Icon : ArrowDown02Icon}
    strokeWidth={2}
    className="text-primary size-3 shrink-0"
  />
)

export const TableHeaderCell = ({
  column,
  header: { column: gridColumn, dragHandle, isDragging, setWidth, style },
  ...actions
}: ColumnActions & { column: Column; header: GridHeaderProps }) => {
  const names = useObjectNames()
  const ref = useRef<HTMLDivElement>(null)
  const pressClosedEditor = useRef(false)
  const cursor = useGridCursorContext()
  const { cycleOrder, items, layout, order } = useColumnMenu(
    column,
    ref,
    actions
  )

  return (
    <AppContextMenu
      items={items}
      contentProps={{ align: 'start', className: 'min-w-52', side: 'bottom' }}
      render={
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- a pointer shortcut; the keyboard sorts through the column menu
        <div
          ref={ref}
          role="columnheader"
          aria-label={`${column.id} ${names.column}`}
          aria-sort={order ? ARIA_SORT[order] : undefined}
          // oxlint-disable-next-line shadcn/no-inline-styles -- column geometry comes from the grid's per-column variables
          style={style}
          className={cn(
            'group/header relative flex items-center gap-1.5 py-1 pr-3 pl-2 outline-none select-none',
            gridColumn.pinned && 'bg-background z-10',
            isDragging && 'bg-background z-10 rounded-md shadow-md'
          )}
          // Read on press: the press blurs an open cell edit, which commits and clears it before the click.
          onPointerDownCapture={() => {
            pressClosedEditor.current = !!cursor.store.get().edit
          }}
          // Focusing the grid without a cursor places one on the first cell and scrolls to it, away from the pressed column.
          onMouseDown={(event) => {
            if (!cursor.store.get().cursor && isHeaderPress(event)) {
              event.preventDefault()
            }
          }}
          onClick={(event) =>
            actions.sortable &&
            !pressClosedEditor.current &&
            isHeaderPress(event) &&
            cycleOrder(event.shiftKey)
          }
          {...dragHandle}
        />
      }
    >
      <div className="flex min-w-0 flex-1">
        <ColumnHeading column={column} />
      </div>
      {order && <SortArrow order={order} />}
      <AppMenuButton
        variant="muted"
        items={items}
        contentProps={{ align: 'end', className: 'min-w-52' }}
        render={<Button variant="ghost" size="icon-xs" tabIndex={-1} />}
      />
      <ColumnResizeHandle
        hidden={isDragging}
        label={`Resize ${column.id} ${names.column}`}
        setWidth={setWidth}
        onResize={(width) => layout.resize(column.id, width)}
        onReset={() => layout.resetSize(column.id)}
      />
    </AppContextMenu>
  )
}

export const TableFieldLabel = ({
  column,
  ...actions
}: ColumnActions & { column: Column }) => {
  const ref = useRef<HTMLDivElement>(null)
  const { items, order } = useColumnMenu(column, ref, actions)

  return (
    <AppContextMenu
      items={items}
      contentProps={{ align: 'start', className: 'min-w-52', side: 'bottom' }}
      render={
        <div
          ref={ref}
          role="rowheader"
          aria-label={`${column.id} field`}
          aria-sort={order ? ARIA_SORT[order] : undefined}
          className="flex h-8 min-w-0 items-center gap-1.5 px-2 select-none"
        />
      }
    >
      <ColumnHeading column={column} />
      {order && <SortArrow order={order} />}
    </AppContextMenu>
  )
}
