import {
  ArrowDown01Icon,
  Layers01Icon,
  MinusSignIcon,
  PlusSignIcon,
  Search01Icon,
  SquareArrowExpand01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { Separator } from '@tamery/ui/components/separator'
import { motion } from 'motion/react'

const EASE = [0.32, 0.72, 0, 1] as const
const CARD_WIDTH = 150
const HEADER_HEIGHT = 28
const ROW_HEIGHT = 24

const TABLES = {
  order_items: {
    columns: ['id', 'product_id', 'order_id', 'quantity'],
    left: 560,
    top: 80,
  },
  orders: {
    columns: ['id', 'user_id', 'total', 'status', 'created_at'],
    left: 300,
    top: 230,
  },
  payments: { columns: ['id', 'order_id', 'amount'], left: 560, top: 310 },
  products: { columns: ['id', 'name', 'price'], left: 300, top: 64 },
  users: { columns: ['id', 'email', 'plan'], left: 40, top: 190 },
}

type TableName = keyof typeof TABLES

const RELATIONS: [TableName, string, TableName, string][] = [
  ['users', 'id', 'orders', 'user_id'],
  ['orders', 'id', 'order_items', 'order_id'],
  ['orders', 'id', 'payments', 'order_id'],
  ['products', 'id', 'order_items', 'product_id'],
]

const rowCenter = (name: TableName, column: string) => {
  const table = TABLES[name]
  return (
    table.top +
    HEADER_HEIGHT +
    table.columns.indexOf(column) * ROW_HEIGHT +
    ROW_HEIGHT / 2
  )
}

const edgePath = ([
  from,
  fromColumn,
  to,
  toColumn,
]: (typeof RELATIONS)[number]) => {
  const startX = TABLES[from].left + CARD_WIDTH
  const startY = rowCenter(from, fromColumn)
  const endX = TABLES[to].left
  const endY = rowCenter(to, toColumn)
  const bend = Math.max((endX - startX) / 2, 32)
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
}

export const Schema = () => (
  <div className="relative min-h-0 flex-1 overflow-hidden">
    <svg aria-hidden className="absolute inset-0 size-full">
      <defs>
        <pattern
          id="showcase-schema-dots"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" className="fill-secondary" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#showcase-schema-dots)" />
      {RELATIONS.map((relation, index) => (
        <motion.path
          key={relation.join('.')}
          d={edgePath(relation)}
          fill="none"
          strokeWidth={1.5}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.35 + index * 0.08, duration: 0.6, ease: EASE }}
          className="stroke-primary"
        />
      ))}
    </svg>
    {Object.entries(TABLES).map(([name, table], index) => (
      <motion.div
        key={name}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.05, duration: 0.35, ease: EASE }}
        // oxlint-disable-next-line shadcn/no-inline-styles -- each card sits at its own diagram coordinates
        style={{ left: table.left, top: table.top, width: CARD_WIDTH }}
        className="bg-popover ring-foreground/4 absolute overflow-hidden rounded-lg text-xs shadow-md ring"
      >
        <div className="flex h-7 items-center border-b px-2.5 font-mono font-medium">
          {name}
        </div>
        {table.columns.map((column) => (
          <div
            key={column}
            className="text-muted-foreground flex h-6 items-center px-2.5 font-mono"
          >
            {column}
          </div>
        ))}
      </motion.div>
    ))}
    <div className="bg-popover/70 ring-foreground/4 absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl p-1 shadow-md ring backdrop-blur">
      <Button variant="ghost-muted" size="xs">
        <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
        public
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
      </Button>
      <Separator orientation="vertical" className="mx-0.5 h-4!" />
      <Button variant="ghost-muted" size="icon-xs">
        <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
      </Button>
      <Button variant="ghost-muted" size="xs">
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        Table
      </Button>
    </div>
    <div className="bg-popover ring-foreground/4 absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-lg shadow-md ring">
      {[
        { icon: PlusSignIcon, label: 'Zoom in' },
        { icon: MinusSignIcon, label: 'Zoom out' },
        { icon: SquareArrowExpand01Icon, label: 'Fit view' },
      ].map(({ icon, label }) => (
        <Button key={label} variant="ghost-muted" size="icon-xs">
          <HugeiconsIcon icon={icon} strokeWidth={2} />
        </Button>
      ))}
    </div>
  </div>
)
