import { LayoutTable02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@tamery/ui/components/sidebar'
import { useVirtualizer } from '@tamery/ui/hooks/use-virtualizer'
import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'
import type { CSSProperties, ComponentRef } from 'react'
import { useDeferredValue, useEffect, useEffectEvent, useRef } from 'react'

import { useObjectNames } from '~/core/catalog/names'

import { DropSchemaDialog } from './drop-schema-dialog'
import { DropTableDialog } from './drop-table-dialog'
import { RenameSchemaDialog } from './rename-schema-dialog'
import { RenameTableDialog } from './rename-table-dialog'
import type { TreeRow } from './tree-row'
import { TreeRowContent } from './tree-row-content'

const ROW_HEIGHTS = {
  empty: 30,
  'new-schema': 44,
  schema: 32,
  separator: 13,
  table: 30,
} satisfies Record<TreeRow['kind'], number>

export const TablesList = ({
  activeId,
  className,
  highlightedControlId,
  highlightedId,
  isPending,
  listId,
  onCreateTable,
  onToggleSchema,
  rows,
  search,
}: {
  activeId?: string
  className?: string
  highlightedControlId: string
  highlightedId?: string
  isPending: boolean
  listId: string
  onCreateTable: (schema?: string) => void
  onToggleSchema: (name: string) => void
  rows: TreeRow[]
  search?: string
}) => {
  const names = useObjectNames()
  const dropSchema = useRef<ComponentRef<typeof DropSchemaDialog>>(null)
  const dropTable = useRef<ComponentRef<typeof DropTableDialog>>(null)
  const renameSchema = useRef<ComponentRef<typeof RenameSchemaDialog>>(null)
  const renameTable = useRef<ComponentRef<typeof RenameTableDialog>>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  const { virtualItems, totalSize, scrollToIndex, range } = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => {
      const row = rows[index]
      return row ? ROW_HEIGHTS[row.kind] : ROW_HEIGHTS.table
    },
    getItemKey: (index) => rows[index]?.id ?? index,
    getScrollElement: () => parentRef.current,
    overscan: 12,
  })
  const stickyRow =
    range &&
    rows.findLast(
      (row, index) => row.kind === 'schema' && index <= range.startIndex
    )

  const scrollToEvent = useEffectEvent((id = activeId) => {
    const index = rows.findIndex((row) => row.id === id)

    if (index !== -1) {
      scrollToIndex(index, { align: 'auto' })
    }
  })

  const hasData = rows.length > 0

  useEffect(() => {
    if (hasData) {
      scrollToEvent()
    }
  }, [hasData])

  useEffect(() => {
    if (highlightedId) {
      scrollToEvent(highlightedId)
    }
  }, [highlightedId])

  const deferredSearch = useDeferredValue(search)
  const isSearchSettled = deferredSearch === search

  if (isPending) {
    return (
      <SidebarContent
        id={listId}
        className={cn('overflow-hidden pl-2', className)}
      >
        <SidebarMenu>
          {Array.from({ length: 12 }).map((_, index) => (
            <SidebarMenuItem key={index}>
              <SidebarMenuSkeleton seed={index} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    )
  }

  if (rows.length === 0) {
    return (
      <SidebarContent
        id={listId}
        className={cn(
          'items-center justify-center py-8 text-center',
          className
        )}
      >
        <HugeiconsIcon
          icon={LayoutTable02Icon}
          strokeWidth={2}
          className="text-muted-foreground/50 mb-2 size-8"
        />
        <p className="text-muted-foreground text-sm">
          {search ? `No ${names.table}s found` : `No ${names.table}s yet`}
        </p>
        {!search && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => onCreateTable()}
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New {names.table}
          </Button>
        )}
      </SidebarContent>
    )
  }

  const rowContent = (row: TreeRow, highlighted: boolean) => (
    <TreeRowContent
      controlId={highlighted ? highlightedControlId : undefined}
      dialogs={{ dropSchema, dropTable, renameSchema, renameTable }}
      row={row}
      search={search}
      onCreateTable={onCreateTable}
      onToggleSchema={onToggleSchema}
    />
  )

  return (
    <div
      id={listId}
      className={cn('relative flex flex-col', className)}
      style={{ '--sticky-height': `${ROW_HEIGHTS.schema}px` } as CSSProperties}
    >
      <SidebarContent
        ref={parentRef}
        tabIndex={-1}
        className={cn(
          'scroll-fade block flex-1 overflow-y-auto pb-2 pl-2',
          stickyRow &&
            '[--scroll-fade-mask:linear-gradient(to_bottom,transparent_var(--sticky-height),#000_calc(var(--sticky-height)+var(--scroll-fade-t)),#000_calc(100%-var(--scroll-fade-b)),transparent_100%)]!'
        )}
      >
        <DropSchemaDialog ref={dropSchema} />
        <DropTableDialog ref={dropTable} />
        <RenameSchemaDialog ref={renameSchema} />
        <RenameTableDialog ref={renameTable} />
        <SidebarMenu
          data-mask
          className="relative h-(--total-size) w-full gap-0"
          style={{ '--total-size': `${totalSize}px` } as CSSProperties}
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) {
              return null
            }
            const highlighted = row !== stickyRow && row.id === highlightedId

            return (
              <motion.li
                key={virtualRow.key}
                initial={false}
                animate={{ y: virtualRow.start }}
                transition={
                  search || !isSearchSettled
                    ? { duration: 0 }
                    : { duration: 0.25, ease: [0.32, 0.72, 0, 1] }
                }
                className="group/menu-item absolute inset-x-0 top-0 h-(--row-height)"
                inert={row === stickyRow}
                data-highlighted={highlighted || undefined}
                style={
                  { '--row-height': `${virtualRow.size}px` } as CSSProperties
                }
              >
                {rowContent(row, highlighted)}
              </motion.li>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
      {stickyRow && (
        <SidebarMenu
          data-mask
          className="absolute inset-x-0 top-0 z-10 pl-2"
          onWheel={(event) =>
            parentRef.current?.scrollBy({ top: event.deltaY })
          }
        >
          <SidebarMenuItem
            className="h-(--sticky-height)"
            data-highlighted={stickyRow.id === highlightedId || undefined}
          >
            {rowContent(stickyRow, stickyRow.id === highlightedId)}
          </SidebarMenuItem>
        </SidebarMenu>
      )}
    </div>
  )
}
