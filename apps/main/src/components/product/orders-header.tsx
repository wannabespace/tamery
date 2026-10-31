import { ArrowDown02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ColumnKindIcon } from '@tamery/ui/components/custom/column-kind-icon'
import { cn } from '@tamery/ui/lib/utils'
import type { ReactNode } from 'react'

import type { OrderColumn } from './order-columns'

export const OrdersHeader = ({
  action,
  children,
  columns,
}: {
  action?: ReactNode
  children?: ReactNode
  columns: OrderColumn[]
}) => (
  <div className="flex h-8 border-b">
    {children}
    {columns.map((column) => (
      <div
        key={column.id}
        className={cn(
          'flex h-full shrink-0 items-center gap-1.5 border-r py-1 pl-2 first:pl-3',
          action ? 'pr-1' : 'pr-2',
          column.width
        )}
      >
        <ColumnKindIcon kind={column.kind} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {column.id}
        </span>
        {column.sorted && (
          <HugeiconsIcon
            icon={ArrowDown02Icon}
            strokeWidth={2}
            className="text-primary size-3 shrink-0"
          />
        )}
        {action}
      </div>
    ))}
  </div>
)
