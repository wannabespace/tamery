import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { pseudoRandom } from '@tamery/shared/utils'
import { Button } from '@tamery/ui/components/button'
import { cardClass } from '@tamery/ui/components/card.utils'
import { Skeleton } from '@tamery/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamery/ui/components/table'
import { cn } from '@tamery/ui/lib/utils'
import type { CSSProperties, RefObject } from 'react'
import { Fragment } from 'react'

import { AppContextMenu, AppMenuButton } from '~/components/app-context-menu'
import type { AppMenuNode } from '~/components/app-menu'

import type { DefinitionsSort } from '../hooks/use-sort'
import type { CellContext, DefinitionsColumn } from '../lib/columns'

const SKELETON_ROWS = 6
const SKELETON_MIN_WIDTH = 40
const SKELETON_WIDTH_RANGE = 45

const ariaSort = (sort: DefinitionsSort | null, header: string) => {
  if (sort?.header !== header) {
    return
  }
  return sort.descending ? 'descending' : 'ascending'
}

const SkeletonRows = <T,>({ columns }: { columns: DefinitionsColumn<T>[] }) =>
  Array.from({ length: SKELETON_ROWS }, (_, row) => (
    <TableRow
      // oxlint-disable-next-line react/no-array-index-key
      key={`skeleton-${row}`}
      aria-busy
    >
      {columns.map((column, index) => (
        <TableCell
          key={column.header}
          className={
            column.align === 'end' ? 'truncate text-right' : 'truncate'
          }
        >
          <Skeleton
            className={cn(
              'h-3 w-(--bar-width) rounded-full',
              column.align === 'end' && 'ml-auto'
            )}
            style={
              {
                '--bar-width': `${SKELETON_MIN_WIDTH + pseudoRandom(row * columns.length + index) * SKELETON_WIDTH_RANGE}%`,
              } as CSSProperties
            }
          />
        </TableCell>
      ))}
      <TableCell />
    </TableRow>
  ))

export const DefinitionsTable = <T,>({
  columns,
  context,
  highlighted,
  getKey,
  groupOf,
  loading,
  getMenu,
  onOpen,
  onSort,
  rows,
  rowsRef,
  sort,
}: {
  columns: DefinitionsColumn<T>[]
  context: CellContext
  highlighted: string | null
  getKey: (item: T) => string
  groupOf?: (item: T) => string
  loading: boolean
  getMenu: (item: T) => AppMenuNode[]
  onOpen: (item: T) => void
  onSort: (column: DefinitionsColumn<T>) => void
  rows: T[]
  rowsRef: RefObject<Map<string, HTMLTableRowElement>>
  sort: DefinitionsSort | null
}) => (
  <div className={cn(cardClass, 'overflow-hidden')}>
    <Table className="min-w-xl table-fixed">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={column.header}
              aria-sort={ariaSort(sort, column.header)}
              className={
                column.align === 'end'
                  ? 'w-(--column-width) truncate text-right'
                  : 'w-(--column-width) truncate'
              }
              style={
                {
                  '--column-width':
                    column.width && `calc(${column.width} * 100%)`,
                } as CSSProperties
              }
            >
              {column.sortValue ? (
                <Button
                  variant="ghost-faint-muted"
                  size="sm"
                  tabIndex={-1}
                  className="-mx-3"
                  onClick={() => onSort(column)}
                >
                  {column.header}
                  {sort?.header === column.header && (
                    <HugeiconsIcon
                      icon={sort.descending ? ArrowDown01Icon : ArrowUp01Icon}
                      strokeWidth={2}
                      data-icon="inline-end"
                    />
                  )}
                </Button>
              ) : (
                column.header
              )}
            </TableHead>
          ))}
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && <SkeletonRows columns={columns} />}
        {rows.map((item, index) => {
          const key = getKey(item)
          const group = groupOf?.(item)
          const opensGroup =
            group !== undefined &&
            (index === 0 || groupOf?.(rows[index - 1] as T) !== group)

          return (
            <Fragment key={key}>
              {opensGroup && (
                <TableRow variant="group">
                  <TableCell
                    data-mask
                    colSpan={columns.length + 1}
                    className="truncate"
                  >
                    {group}
                  </TableCell>
                </TableRow>
              )}
              <AppContextMenu
                items={() => getMenu(item)}
                render={
                  // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                  <TableRow
                    ref={(element) => {
                      if (element) {
                        rowsRef.current.set(key, element)
                      } else {
                        rowsRef.current.delete(key)
                      }
                    }}
                    data-highlighted={highlighted === key || undefined}
                    className="group/row transition-none"
                    onClick={() => onOpen(item)}
                  />
                }
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.header}
                    className={
                      column.align === 'end'
                        ? 'truncate text-right'
                        : 'truncate'
                    }
                  >
                    {column.cell(item, context)}
                  </TableCell>
                ))}
                <TableCell className="text-right opacity-0 group-hover/row:opacity-100 group-data-highlighted/row:opacity-100 has-focus-visible:opacity-100 has-aria-expanded:opacity-100">
                  <AppMenuButton
                    variant="muted"
                    items={() => getMenu(item)}
                    render={<Button variant="ghost-faint" size="icon-xs" />}
                    className="-my-0.5"
                  />
                </TableCell>
              </AppContextMenu>
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  </div>
)
