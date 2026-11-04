import { AppLogo } from '@tamery/ui/components/brand/app-logo'
import { motion } from 'motion/react'

import { ORDERS } from '~/components/product/orders'

import { OrdersGrid } from './orders-grid'
import { ProductCrop } from './product-crop'
import { revealRight, rise } from './variants'

const REFRESHED_ORDER = '58307'

export const ShareIllustration = () => (
  <ProductCrop stage className="bg-body">
    <div className="text-muted-foreground flex h-8 items-center gap-2 border-b px-3 text-xs">
      <AppLogo className="text-primary size-3.5" />
      <motion.span variants={revealRight(0.1, 0.45)}>
        share.tamery.app/7kq2
      </motion.span>
    </div>
    <div className="flex flex-col gap-3 p-4">
      <motion.div variants={rise(0.5)} className="flex flex-col gap-1 px-1">
        <span className="text-xl font-semibold tracking-tight">Top orders</span>
        <span className="text-muted-foreground text-xs">
          4 columns · 24 rows
        </span>
      </motion.div>
      <div className="bg-background ring-foreground/4 overflow-hidden rounded-xl ring">
        <OrdersGrid
          at={0.6}
          flashed={{ at: 1.5, id: REFRESHED_ORDER }}
          orders={ORDERS.slice(0, 6)}
        />
      </div>
    </div>
  </ProductCrop>
)
