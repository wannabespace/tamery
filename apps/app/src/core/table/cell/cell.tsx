/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a virtualized flex grid cannot be built from table elements */
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { Badge } from '@tamery/ui/components/badge'
import { Checkbox } from '@tamery/ui/components/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'
import type { CSSProperties, ReactNode } from 'react'
import { useRef } from 'react'

import { createTransformer } from '~/core/transformers/create-transformer'
import type { ValueTransformer } from '~/core/transformers/value-transformer'
import { isNested } from '~/core/transformers/value-transformer'

import type { DataGridLayout } from '../cursor'
import { useCellCursor } from '../cursor'
import type { Draft } from '../session'
import { CellField } from './cell-editor'
import { Tag } from './cell-select'
import { JsonPeek, JsonTree } from './json-tree'
import type { Column } from './utils'
import { getLocalTime, hasTabularFigures } from './utils'

const TIME_ZONE = new Intl.DateTimeFormat().resolvedOptions().timeZone

export const CELL_FLASH_DURATION_MS = 1500

const CellValue = ({
  column,
  label,
  layout,
  size,
  transformer,
  value,
}: {
  column: Column
  label?: string
  layout: DataGridLayout
  size: number
  transformer: ValueTransformer
  value: unknown
}) => {
  if (value === undefined) {
    return <span className="italic">default</span>
  }
  if (value !== null) {
    switch (column.uiType) {
      case 'boolean': {
        return (
          <Checkbox
            aria-label={`Value of ${column.id}`}
            checked={transformer.fromConnection(value).toUI() === true}
            readOnly
            tabIndex={-1}
            className={cn(layout === 'documents' && 'my-0.5')}
          />
        )
      }
      case 'select': {
        return <Tag column={column} value={String(value)} />
      }
      case 'list': {
        const items: unknown = transformer.fromConnection(value).toUI()
        if (Array.isArray(items) && items.length > 0) {
          return (
            <div
              className={cn(
                'flex min-w-0 flex-1 gap-1',
                layout === 'documents'
                  ? 'flex-wrap py-0.5'
                  : 'end-fade overflow-hidden'
              )}
            >
              {items.map((item, index) => (
                <Tag
                  key={index}
                  className="shrink-0"
                  column={column}
                  value={String(item)}
                />
              ))}
            </div>
          )
        }
        break
      }
      default: {
        break
      }
    }
    if (label !== undefined) {
      return (
        <span data-mask className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate tabular-nums">
            {transformer.toDisplay(value, size)}
          </span>
          <Badge variant="secondary" className="max-w-2/3 shrink-0">
            <span className="truncate">{label}</span>
          </Badge>
        </span>
      )
    }
    const localTime = getLocalTime(value)
    if (localTime) {
      return (
        <span data-mask className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="max-w-full shrink-0 truncate tabular-nums">
            {transformer.toDisplay(value, size)}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-muted-foreground min-w-0 truncate tabular-nums" />
              }
            >
              {localTime}
            </TooltipTrigger>
            <TooltipContent>Your time ({TIME_ZONE})</TooltipContent>
          </Tooltip>
        </span>
      )
    }
    if (layout === 'documents' && isNested(value)) {
      return (
        <div className="min-w-0 flex-1 py-0.5">
          <JsonTree value={value} />
        </div>
      )
    }
  }
  return (
    <span
      data-mask
      className={cn(
        layout === 'documents'
          ? 'my-0.5 line-clamp-4 min-w-0 flex-1 wrap-break-word whitespace-pre-wrap'
          : 'truncate',
        hasTabularFigures(column) && 'tabular-nums'
      )}
    >
      {transformer.toDisplay(value, size)}
    </span>
  )
}

const overlayClass = (
  state: ReturnType<typeof useCellCursor>['state'],
  draft: Pick<Draft, 'error' | 'isCommitting'> | undefined
) =>
  cn(
    'pointer-events-none absolute inset-0 -z-10',
    draft && 'bg-warning/15',
    draft?.error && 'bg-destructive/10 inset-ring-destructive/40 inset-ring',
    (state === 'cursor' || state === 'peek' || state === 'range-cursor') &&
      'inset-ring-foreground/20 group-focus-within/grid:inset-ring-ring/50 inset-ring-3',
    (state === 'range' || state === 'range-cursor') && 'bg-primary/10'
  )

export interface CellGeometry {
  isDragging?: boolean
  pinned?: boolean
  size?: number
  style?: CSSProperties
}

export const TableCell = ({
  children,
  column,
  dialect,
  draft,
  flash,
  isDragging,
  label,
  pinned,
  rowIndex,
  size = Number.MAX_SAFE_INTEGER,
  style,
  value,
}: CellGeometry & {
  children?: ReactNode
  column: Column
  dialect: Dialect
  draft?: Pick<Draft, 'error' | 'isCommitting'>
  /** Set when a refetch changed the value; a new number replays the flash. */
  flash?: number
  label?: string
  rowIndex: number
  value: unknown
}) => {
  const { cursor, state } = useCellCursor({
    column: column.id,
    row: rowIndex,
  })
  const { layout } = cursor
  const ref = useRef<HTMLDivElement>(null)
  const transformer = createTransformer(dialect, column)

  return (
    <div
      ref={ref}
      role="gridcell"
      aria-selected={state !== null}
      data-cell
      data-cursor={state && state !== 'range' ? '' : undefined}
      data-column={column.id}
      data-row={rowIndex}
      title={draft?.error}
      style={style}
      className={cn(
        'group/cell relative isolate flex h-full scroll-mt-(--table-header-height) items-center gap-1 px-2 text-xs select-none',
        layout === 'documents' && 'min-w-0 py-1.5',
        (value === null || value === undefined || value === '') &&
          'text-muted-foreground/60',
        draft?.isCommitting && 'animate-pulse',
        pinned && 'bg-background group-hover/row:bg-accent z-10',
        isDragging && 'bg-background z-10'
      )}
    >
      {flash !== undefined && (
        <div
          key={flash}
          aria-hidden
          className="bg-primary/20 animate-out fade-out fill-mode-forwards pointer-events-none absolute inset-0 -z-10 duration-(--flash-duration) ease-out"
          style={
            {
              '--flash-duration': `${CELL_FLASH_DURATION_MS}ms`,
            } as CSSProperties
          }
        />
      )}
      {(state || draft) && (
        <div aria-hidden className={overlayClass(state, draft)} />
      )}
      <CellValue
        column={column}
        label={label}
        layout={layout}
        size={size}
        transformer={transformer}
        value={value}
      />
      {children}
      {state === 'peek' && isNested(value) && (
        <JsonPeek
          anchor={ref}
          column={column.id}
          onClose={() => cursor.closePeek()}
          value={value}
        />
      )}
      {state === 'editing' && (
        <CellField
          anchor={ref}
          column={column}
          rowIndex={rowIndex}
          value={value}
        />
      )}
    </div>
  )
}
