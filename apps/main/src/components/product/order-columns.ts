import type { ColumnKind } from '@tamery/shared/column-kind'

import type { Order } from './orders'

export interface OrderColumn {
  id: keyof Order
  kind: ColumnKind
  sorted?: boolean
  width: string
}

export const ORDER_COLUMNS: OrderColumn[] = [
  { id: 'id', kind: 'key', width: 'w-20' },
  { id: 'user_id', kind: 'link', width: 'w-28' },
  { id: 'customer', kind: 'text', width: 'w-36' },
  { id: 'total', kind: 'number', sorted: true, width: 'w-28' },
  { id: 'status', kind: 'select', width: 'w-28' },
  { id: 'created_at', kind: 'date', width: 'w-40' },
]

export const orderCellClass =
  'flex h-full shrink-0 items-center gap-1 border-r px-2 text-xs tabular-nums first:pl-3'
