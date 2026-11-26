/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the app's virtualized flex grid cannot be built from table elements */
import { ArrowDown02Icon, ArrowUp02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ColumnKind } from '@tamery/shared/column-kind'
import type { GridRow } from '@tamery/table'
import {
  ARIA_SORT,
  getColumnSize,
  Grid,
  useGridNavigation,
} from '@tamery/table'
import { Checkbox } from '@tamery/ui/components/checkbox'
import { ColumnKindIcon } from '@tamery/ui/components/custom/column-kind-icon'
import { ScrollArea } from '@tamery/ui/components/custom/scroll-area'
import { Popover, PopoverContent } from '@tamery/ui/components/popover'
import { cn } from '@tamery/ui/lib/utils'
import { useHotkeys } from '@tanstack/react-hotkeys'
import type { ReactNode } from 'react'
import { useRef, useState } from 'react'

import { posthog } from '~/lib/posthog'

const CURSOR_CLASS =
  'pointer-events-none absolute inset-0 group-focus-within/grid:inset-ring-3 group-focus-within/grid:inset-ring-ring/50'

interface Peek {
  column: string
  row: number
  value: string
}

export const ShareGrid = ({
  columns,
  footer,
  isFetching,
  onEndReached,
  orderBy,
  rows,
}: {
  columns: { id: string; kind: ColumnKind; type: string | null }[]
  footer: ReactNode
  isFetching: boolean
  onEndReached: () => void
  orderBy: Record<string, 'ASC' | 'DESC'>
  rows: GridRow[]
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const peekAnchor = useRef<HTMLDivElement>(null)
  const kinds = new Map(columns.map(({ id, kind }) => [id, kind]))
  const gridColumns = columns.map((column) => ({
    id: column.id,
    size: getColumnSize(column.type),
  }))
  const { cursor, place, scrollToRef } = useGridNavigation({
    columns: gridColumns,
    rowCount: rows.length,
    scrollRef,
  })
  const isCursor = (row: number, column: string) =>
    cursor.row === row && gridColumns[cursor.column]?.id === column

  const [peek, setPeek] = useState<Peek | null>(null)
  const [shown, setShown] = useState(peek)
  if (peek && peek !== shown) {
    setShown(peek)
  }
  const isPeek = (row: number, column: string) =>
    shown?.row === row && shown.column === column

  const openPeek = (next: Peek) => {
    setPeek(next)
    void posthog.capture('share_cell_opened', { kind: kinds.get(next.column) })
  }

  const openCursorPeek = () => {
    const column = gridColumns[cursor.column]?.id
    const value = column ? rows[cursor.row]?.[column] : undefined
    if (column && typeof value === 'string') {
      openPeek({ column, row: cursor.row, value })
    }
  }

  useHotkeys(
    [
      { callback: openCursorPeek, hotkey: 'Enter' },
      { callback: openCursorPeek, hotkey: 'Space' },
    ],
    { target: scrollRef }
  )

  return (
    <div className="min-h-0 flex-1">
      <Grid
        scrollRef={scrollRef}
        scrollToRef={scrollToRef}
        footer={footer}
        isFetching={isFetching}
        onEndReached={onEndReached}
        renderBody={(body) => body}
        rows={rows}
        columns={gridColumns}
        renderHeader={({ column, style }) => {
          const sorted = orderBy[column.id] ?? null
          return (
            <div
              role="columnheader"
              aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
              style={style}
              className="flex h-8 items-center pr-3 pl-2 select-none"
            >
              <span className="text-foreground flex min-w-0 flex-1 items-center gap-1.5">
                <ColumnKindIcon kind={kinds.get(column.id) ?? 'text'} />
                <span data-mask className="truncate text-xs font-medium">
                  {column.id}
                </span>
                {sorted && (
                  <HugeiconsIcon
                    icon={sorted === 'ASC' ? ArrowUp02Icon : ArrowDown02Icon}
                    strokeWidth={2}
                    className="text-primary ml-auto size-3 shrink-0"
                  />
                )}
              </span>
            </div>
          )
        }}
        renderCell={({ column, row, rowIndex, style }) => {
          const value = row[column.id]
          const kind = kinds.get(column.id)
          return (
            <div
              ref={isPeek(rowIndex, column.id) ? peekAnchor : undefined}
              role="gridcell"
              tabIndex={-1}
              data-cursor={isCursor(rowIndex, column.id) || undefined}
              style={style}
              className={cn(
                'relative flex h-full scroll-mt-8 items-center gap-1 px-2 text-xs outline-none',
                typeof value !== 'string' && 'text-muted-foreground/60'
              )}
              onPointerDown={() => place(rowIndex, gridColumns.indexOf(column))}
              onDoubleClick={() =>
                typeof value === 'string' &&
                openPeek({ column: column.id, row: rowIndex, value })
              }
            >
              {typeof value !== 'string' && 'null'}
              {typeof value === 'string' &&
                (kind === 'boolean' ? (
                  <Checkbox
                    aria-label={`Value of ${column.id}`}
                    checked={value === 'true'}
                    readOnly
                    tabIndex={-1}
                  />
                ) : (
                  <span
                    data-mask
                    className={cn(
                      'truncate',
                      (kind === 'number' ||
                        kind === 'date' ||
                        kind === 'time') &&
                        'tabular-nums'
                    )}
                  >
                    {value}
                  </span>
                ))}
              {isCursor(rowIndex, column.id) && (
                <span aria-hidden className={CURSOR_CLASS} />
              )}
            </div>
          )
        }}
      />
      <Popover
        open={!!peek}
        onOpenChange={(open) => !open && setPeek(null)}
        onOpenChangeComplete={(open) => !open && setShown(null)}
      >
        {shown && (
          <PopoverContent
            anchor={peekAnchor}
            align="start"
            padding="none"
            className="w-md overflow-hidden"
          >
            <div className="flex h-9 shrink-0 items-center border-b px-4 text-xs">
              <span data-mask className="truncate font-medium">
                {shown.column}
              </span>
            </div>
            <ScrollArea className="scroll-fade max-h-[min(32rem,60vh)] min-h-0">
              <div
                data-mask
                className="px-4 py-3 text-xs wrap-break-word whitespace-pre-wrap select-text"
              >
                {shown.value}
              </div>
            </ScrollArea>
          </PopoverContent>
        )}
      </Popover>
    </div>
  )
}
