import {
  ArrowUpRight01Icon,
  LayoutTable02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'

import { OrderCell } from '~/components/product/order-cell'
import {
  ORDER_COLUMNS,
  orderCellClass,
} from '~/components/product/order-columns'
import { ORDERS } from '~/components/product/orders'
import { OrdersHeader } from '~/components/product/orders-header'

import { ProductCrop } from './product-crop'
import { appear, pop, rise } from './variants'

const COLUMNS = ORDER_COLUMNS.filter(({ id }) =>
  ['id', 'user_id', 'customer', 'total'].includes(id)
)

const [PEEKED_ORDER] = ORDERS

const USER_FIELDS = [
  ['name', PEEKED_ORDER?.customer],
  ['email', 'priya@raman.io'],
  ['plan', 'pro'],
]

const PEEK_AT = 0.6

export const PeekIllustration = () => (
  <ProductCrop>
    <div className="relative">
      <OrdersHeader columns={COLUMNS} />
      {ORDERS.slice(0, 5).map((order, index) => (
        <motion.div
          key={order.id}
          variants={rise(0.1 + index * 0.05)}
          className="flex h-8 border-b"
        >
          {COLUMNS.map(({ id, width }) => (
            <div
              key={id}
              className={cn(orderCellClass, 'relative isolate', width)}
            >
              <OrderCell id={id} order={order} />
              {id === 'user_id' && (
                <Button
                  variant="ghost-faint"
                  size="icon-2xs"
                  className="ml-auto"
                >
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    strokeWidth={2}
                    className="text-muted-foreground size-3"
                  />
                </Button>
              )}
              {id === 'user_id' && order === PEEKED_ORDER && (
                <motion.span
                  variants={appear(PEEK_AT)}
                  className="ring-primary absolute inset-0 ring-2 ring-inset"
                />
              )}
            </div>
          ))}
        </motion.div>
      ))}
      <motion.div
        variants={pop(PEEK_AT + 0.15, -4)}
        className="bg-popover ring-foreground/4 absolute top-17 left-20 w-64 overflow-hidden rounded-xl text-xs shadow-xl ring"
      >
        <div className="flex h-8 items-center gap-1.5 border-b px-3 font-medium">
          <HugeiconsIcon
            icon={LayoutTable02Icon}
            strokeWidth={2}
            className="text-muted-foreground size-3.5"
          />
          users
          <span className="text-muted-foreground font-normal">
            · {PEEKED_ORDER?.user_id}
          </span>
        </div>
        <div className="flex flex-col py-1">
          {USER_FIELDS.map(([field, value]) => (
            <div key={field} className="flex h-7 items-center gap-3 px-3">
              <span className="text-muted-foreground w-10 font-mono">
                {field}
              </span>
              {value}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  </ProductCrop>
)
