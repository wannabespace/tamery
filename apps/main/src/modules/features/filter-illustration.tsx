import { CommandIcon, SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { FilterChip } from '@tamery/ui/components/custom/filter-chip'
import { Kbd } from '@tamery/ui/components/kbd'
import { motion } from 'motion/react'

import { ORDERS } from '~/components/product/orders'

import { OrdersGrid } from './orders-grid'
import { ProductCrop } from './product-crop'
import { Typed } from './typed'
import { appear, pop, vanish } from './variants'

const MIN_TOTAL = 580
const SENTENCE = `paid orders over $${MIN_TOTAL}`

const FILTERS = [
  { column: 'status', operator: 'is', value: 'paid' },
  { column: 'total', operator: 'over', value: String(MIN_TOTAL) },
]

const TYPE_AT = 0.2
const TYPE_STEP = 0.03
const CONVERT_AT = TYPE_AT + SENTENCE.length * TYPE_STEP + 0.25

export const FilterIllustration = () => (
  <ProductCrop stage>
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <div className="bg-input ring-foreground/4 relative flex min-h-8 min-w-0 flex-1 items-center gap-1 rounded-xl py-0.75 pr-1.5 pl-2 shadow-xs ring">
        <HugeiconsIcon
          icon={SparklesIcon}
          strokeWidth={2}
          className="text-primary mr-1 size-4 shrink-0"
        />
        <motion.span
          variants={vanish(CONVERT_AT)}
          className="absolute inset-y-0 left-8 flex items-center text-sm whitespace-pre"
        >
          <Typed at={TYPE_AT} step={TYPE_STEP} text={SENTENCE} />
        </motion.span>
        {FILTERS.map((filter, index) => (
          <motion.span
            key={filter.column}
            variants={pop(CONVERT_AT + 0.05 + index * 0.1, 0)}
          >
            <FilterChip removable {...filter} />
          </motion.span>
        ))}
        <motion.span
          variants={appear(CONVERT_AT + 0.3)}
          className="text-muted-foreground min-w-0 flex-1 truncate pl-1 text-sm"
        >
          Filter or ask AI…
        </motion.span>
        <Kbd>
          <HugeiconsIcon icon={CommandIcon} strokeWidth={2} />F
        </Kbd>
      </div>
    </div>
    <OrdersGrid
      at={0.1}
      filtered={{
        at: CONVERT_AT + 0.3,
        matches: ({ status, total }) =>
          status === 'paid' && Number(total.slice(1)) > MIN_TOTAL,
      }}
      orders={ORDERS.slice(0, 8)}
    />
  </ProductCrop>
)
