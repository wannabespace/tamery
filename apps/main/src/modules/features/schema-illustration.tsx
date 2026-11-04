import type { MotionValue } from 'motion/react'
import { motion, useMotionValue, useTransform } from 'motion/react'
import { useRef } from 'react'

import { ProductCrop } from './product-crop'
import { EASE, REWIND } from './variants'

const CARD_WIDTH = 112
const HEADER_HEIGHT = 24
const ROW_HEIGHT = 20

interface Card {
  columns: string[]
  left: number
  name: string
  top: number
  x: MotionValue<number>
  y: MotionValue<number>
}

const useCard = (
  name: string,
  columns: string[],
  left: number,
  top: number
): Card => ({
  columns,
  left,
  name,
  top,
  x: useMotionValue(0),
  y: useMotionValue(0),
})

const rowCenter = (card: Card, column: string) =>
  card.top +
  card.y.get() +
  HEADER_HEIGHT +
  card.columns.indexOf(column) * ROW_HEIGHT +
  ROW_HEIGHT / 2

const Edge = ({
  from,
  fromColumn,
  to,
  toColumn,
}: {
  from: Card
  fromColumn: string
  to: Card
  toColumn: string
}) => {
  const d = useTransform(() => {
    const startX = from.left + from.x.get() + CARD_WIDTH
    const startY = rowCenter(from, fromColumn)
    const endX = to.left + to.x.get()
    const endY = rowCenter(to, toColumn)
    const bend = Math.max(Math.abs(endX - startX) / 2, 24)
    return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
  })
  return (
    <motion.path
      d={d}
      fill="none"
      strokeWidth={1.5}
      variants={{
        hidden: { pathLength: 0, transition: REWIND },
        shown: {
          pathLength: 1,
          transition: { delay: 0.5, duration: 0.6, ease: EASE },
        },
      }}
      className="stroke-primary"
    />
  )
}

const TableCard = ({
  card,
  constraints,
  delay,
}: {
  card: Card
  constraints: React.RefObject<HTMLDivElement | null>
  delay: number
}) => (
  <motion.div
    drag
    dragConstraints={constraints}
    dragMomentum={false}
    whileDrag={{ scale: 1.04 }}
    variants={{
      hidden: { opacity: 0, scale: 0.94, transition: REWIND },
      shown: {
        opacity: 1,
        scale: 1,
        transition: { delay, duration: 0.4, ease: EASE },
      },
    }}
    // oxlint-disable-next-line shadcn/no-inline-styles -- each card's start and drag offset are per-card numbers
    style={{ left: card.left, top: card.top, x: card.x, y: card.y }}
    className="bg-popover ring-foreground/4 text-2xs absolute w-28 overflow-hidden rounded-lg shadow-md ring"
  >
    <div className="flex h-6 items-center border-b px-2 font-mono font-medium">
      {card.name}
    </div>
    {card.columns.map((column) => (
      <div
        key={column}
        className="text-muted-foreground flex h-5 items-center px-2 font-mono"
      >
        {column}
      </div>
    ))}
  </motion.div>
)

export const SchemaIllustration = () => {
  const ref = useRef<HTMLDivElement>(null)
  const users = useCard('users', ['id', 'email', 'plan'], 20, 20)
  const orders = useCard(
    'orders',
    ['id', 'user_id', 'total', 'status'],
    176,
    48
  )
  const items = useCard('order_items', ['order_id', 'product_id'], 336, 24)

  return (
    <ProductCrop>
      <div ref={ref} className="relative size-full">
        <svg className="absolute inset-0 size-full">
          <defs>
            <pattern
              id="schema-dots"
              width="12"
              height="12"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" className="fill-secondary" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#schema-dots)" />
          <Edge from={users} fromColumn="id" to={orders} toColumn="user_id" />
          <Edge from={orders} fromColumn="id" to={items} toColumn="order_id" />
        </svg>
        {[users, orders, items].map((card, index) => (
          <TableCard
            key={card.name}
            card={card}
            constraints={ref}
            delay={(index + 1) / 10}
          />
        ))}
      </div>
    </ProductCrop>
  )
}
