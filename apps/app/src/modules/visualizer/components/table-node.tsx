import {
  FlashIcon,
  Key01Icon,
  LeftToRightListDashIcon,
  Link01Icon,
  SecurityCheckIcon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { HighlightText } from '@tamery/ui/components/custom/highlight'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import type { Node, NodeProps } from '@xyflow/react'
import { useUpdateNodeInternals, useViewportStore } from '@xyflow/react'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import { AppContextMenu } from '~/components/app-context-menu'
import { tableTypeIcon } from '~/core/catalog/table-type'

import {
  COMPACT_ZOOM,
  relationTouches,
  tableMatches,
  useDiagram,
} from '../lib/context'
import type { DiagramColumn, DiagramTable } from '../lib/schema'
import { columnMenu, tableMenu } from './menus'
import { RowHandles } from './row-handles'

export type TableNode = Node<{ table: DiagramTable }, 'table'>

export const draftStateClass = {
  added: 'bg-success/8',
  changed: 'bg-primary/6 italic',
  dropped: 'bg-destructive/8 line-through opacity-60',
}

const Count = ({
  count,
  icon,
  label,
}: {
  count: number
  icon: IconSvgElement
  label: string
}) =>
  count > 0 && (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="text-2xs text-muted-foreground flex items-center gap-0.5 tabular-nums" />
        }
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3" />
        {count}
      </TooltipTrigger>
      <TooltipContent>
        {count} {label}
      </TooltipContent>
    </Tooltip>
  )

export const TableNodeView = ({ data, id, selected }: NodeProps<TableNode>) => {
  const { table } = data
  const { actions, can, diagram, search, view } = useDiagram()
  const [hovered, setHovered] = useState(false)
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    if (hovered) {
      updateNodeInternals(id)
    }
  }, [hovered, id, updateNodeInternals])
  useEffect(
    () => () =>
      view.set((state) =>
        state.hoveredTableId === table.id
          ? { ...state, hoveredTableId: null }
          : state
      ),
    [table.id, view]
  )
  const related = useSubscription(view, {
    selector: ({ hoveredRelationIds, hoveredTableId }) =>
      diagram.relations.some(
        (relation) =>
          relationTouches(relation, table.id) &&
          (hoveredRelationIds.includes(relation.id) ||
            (hoveredTableId !== null &&
              hoveredTableId !== table.id &&
              relationTouches(relation, hoveredTableId)))
      ),
  })
  const compact = useViewportStore((state) => state.transform[2] < COMPACT_ZOOM)
  const linkedColumns = new Set(
    diagram.relations.flatMap((relation) => [
      relation.source.table === table.id ? relation.source.column : '',
      relation.target.table === table.id ? relation.target.column : '',
    ])
  )
  const connectable =
    can.foreignKeys && table.kind === 'table' && table.state !== 'dropped'
  const dimmed = !!search && !tableMatches(table, search)
  const menuColumn = useRef<DiagramColumn | null>(null)

  return (
    <AppContextMenu
      items={() =>
        menuColumn.current
          ? columnMenu(table, menuColumn.current, { actions, can, diagram })
          : tableMenu(table, can, actions)
      }
      className="block"
    >
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onMouseEnter={() => {
          setHovered(true)
          view.set((state) => ({ ...state, hoveredTableId: table.id }))
        }}
        onMouseLeave={() => {
          setHovered(false)
          view.set((state) => ({ ...state, hoveredTableId: null }))
        }}
        onContextMenuCapture={() => {
          menuColumn.current = null
        }}
        className={cn(
          'group/node bg-popover ring-foreground/4 in-[[aria-roledescription=node]:focus-visible]:focus-ring relative w-64 rounded-xl text-xs shadow-md ring outline-2 outline-offset-2 outline-transparent transition-[box-shadow,opacity,outline-color] select-none',
          selected && 'outline-primary',
          related && 'outline-primary/40',
          dimmed && 'opacity-35',
          table.state === 'dropped' && 'opacity-60',
          table.state === 'added' && 'ring-success/40'
        )}
      >
        <header
          className={cn(
            'border-foreground/6 flex h-8 items-center gap-2 border-b px-3',
            table.state === 'changed' && 'italic',
            table.state === 'dropped' && 'line-through',
            compact && 'invisible'
          )}
        >
          <HugeiconsIcon
            icon={tableTypeIcon[table.kind]}
            strokeWidth={2}
            className="text-muted-foreground size-4 shrink-0"
          />
          <span data-mask className="truncate text-sm font-medium">
            <HighlightText text={table.name} match={search} />
          </span>
          {table.kind !== 'table' && (
            <span className="text-2xs text-muted-foreground shrink-0 tracking-wider uppercase">
              {table.kind === 'view' ? 'view' : 'mat. view'}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Count
              count={table.counts.indexes}
              icon={LeftToRightListDashIcon}
              label="indexes"
            />
            <Count
              count={table.counts.triggers}
              icon={FlashIcon}
              label="triggers"
            />
            <Count
              count={table.counts.policies}
              icon={SecurityCheckIcon}
              label="policies"
            />
          </span>
        </header>
        <div className="py-1">
          {table.columns.map((column) => {
            const handles = (
              <RowHandles
                column={column}
                connectable={connectable}
                hovered={hovered}
                linked={linkedColumns.has(column.id)}
              />
            )

            if (compact) {
              return (
                <div key={column.id} className="relative h-7">
                  {handles}
                </div>
              )
            }

            return (
              // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
              <div
                key={column.id}
                onContextMenu={() => {
                  menuColumn.current = column
                }}
                className={cn(
                  'hover:bg-accent relative flex h-7 items-center gap-1.5 px-3 transition-colors',
                  column.state && draftStateClass[column.state]
                )}
              >
                {column.primaryKey && (
                  <HugeiconsIcon
                    icon={Key01Icon}
                    strokeWidth={2}
                    className="text-primary size-3 shrink-0"
                  />
                )}
                {!column.primaryKey && column.foreign && (
                  <HugeiconsIcon
                    icon={Link01Icon}
                    strokeWidth={2}
                    className="text-muted-foreground/70 size-3 shrink-0"
                  />
                )}
                <span data-mask className="truncate font-mono">
                  <HighlightText text={column.name} match={search} />
                </span>
                <span
                  data-mask
                  className="text-muted-foreground/70 ml-auto max-w-[45%] shrink-0 truncate font-mono"
                >
                  {column.label}
                  {column.nullable && '?'}
                </span>
                {handles}
              </div>
            )
          })}
          {table.columns.length === 0 && (
            <p
              className={cn(
                'text-muted-foreground flex h-7 items-center px-3',
                compact && 'invisible'
              )}
            >
              No columns yet
            </p>
          )}
        </div>
        {compact && (
          <div
            style={
              {
                '--label-size': `min(4rem, calc(0.875rem / var(--diagram-zoom)), calc(27rem / ${table.name.length}))`,
              } as CSSProperties
            }
            className="pointer-events-none absolute inset-0 flex items-center justify-center px-2"
          >
            <span
              data-mask
              className="text-foreground max-w-full truncate text-(length:--label-size) leading-none font-medium"
            >
              {table.name}
            </span>
          </div>
        )}
      </div>
    </AppContextMenu>
  )
}
