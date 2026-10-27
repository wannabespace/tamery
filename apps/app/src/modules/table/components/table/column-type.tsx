import { EraserIcon, Key01Icon, Link01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ColumnKindIcon } from '@tamery/ui/components/custom/column-kind-icon'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'

import { useConnectionContext } from '~/core/connection/route'
import type { Column } from '~/core/table/cell/utils'
import { getColumnKind } from '~/core/table/cell/utils'

const columnClauses = (column: Column) =>
  [
    column.typeLabel && ['TYPE', column.typeLabel],
    column.primaryKey ? ['PRIMARY KEY'] : column.unique && ['UNIQUE'],
    column.foreign && [
      'REFERENCES',
      `${column.foreign.table}(${column.foreign.column})`,
    ],
    [column.isNullable ? 'NULLABLE' : 'NOT NULL'],
    column.defaultValue && ['DEFAULT', column.defaultValue],
    column.availableValues && [
      'ENUM',
      `(${column.availableValues.map((value) => `'${value}'`).join(', ')})`,
    ],
  ].filter((clause) => Array.isArray(clause))

const ColumnClauses = ({ column }: { column: Column }) => (
  <TooltipContent side="bottom" className="max-w-sm">
    <div className="text-2xs flex flex-col font-mono leading-4">
      {columnClauses(column).map(([keyword, value]) => (
        <span key={keyword}>
          <span className="opacity-60">{keyword}</span>
          {value && <span data-mask> {value}</span>}
        </span>
      ))}
    </div>
  </TooltipContent>
)

export const ColumnHeading = ({ column }: { column: Column }) => {
  const { dialect } = useConnectionContext()
  return (
    <Tooltip>
      <TooltipTrigger
        render={<div className="flex min-w-0 items-center gap-1.5" />}
      >
        <ColumnKindIcon
          kind={getColumnKind(dialect, column)}
          label={column.typeLabel}
        />
        <span data-mask className="truncate text-xs font-medium">
          {column.id}
        </span>
      </TooltipTrigger>
      <ColumnClauses column={column} />
    </Tooltip>
  )
}

export const ColumnType = ({ column }: { column: Column }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <div className="text-muted-foreground text-2xs flex w-fit max-w-full items-center gap-1 leading-4" />
      }
    >
      {column.primaryKey && (
        <HugeiconsIcon
          icon={Key01Icon}
          strokeWidth={2}
          className="text-primary size-2.5 shrink-0"
        />
      )}
      {column.foreign && (
        <HugeiconsIcon
          icon={Link01Icon}
          strokeWidth={2}
          className="size-2.5 shrink-0"
        />
      )}
      {column.isNullable && (
        <HugeiconsIcon
          icon={EraserIcon}
          strokeWidth={2}
          className="size-2.5 shrink-0 opacity-70"
        />
      )}
      <span data-mask className="truncate">
        {column.typeLabel}
      </span>
    </TooltipTrigger>
    <ColumnClauses column={column} />
  </Tooltip>
)
