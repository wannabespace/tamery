import { SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'

import { ProductCrop } from './product-crop'
import { Typed } from './typed'
import { appear, expand, pop } from './variants'

const PROMPT = 'paid ones over $500'

const LINES = [
  { code: ['SELECT', ' customer, sum(total)'] },
  { code: ['FROM', ' orders'] },
  { added: true, code: ['WHERE', " status = 'paid'"] },
  { added: true, code: ['  AND', ' total > 500'] },
  { code: ['GROUP BY', ' customer'] },
]

const FIRST_ADDED = LINES.findIndex(({ added }) => added)

const PROMPT_AT = 0.2
const TYPE_AT = PROMPT_AT + 0.25
const TYPE_STEP = 0.035
const REWRITE_AT = TYPE_AT + PROMPT.length * TYPE_STEP + 0.25

const Line = ({
  index,
  line,
}: {
  index: number
  line: (typeof LINES)[number]
}) => {
  const [keyword, rest] = line.code
  return (
    <motion.div
      variants={line.added ? expand(REWRITE_AT + 0.05 * index) : undefined}
      className={cn('flex overflow-hidden', line.added && 'bg-primary/10')}
    >
      <span className="text-muted-foreground/60 w-10 shrink-0 pr-3 text-right">
        {index + 1}
      </span>
      <span className="text-muted-foreground whitespace-pre">{keyword}</span>
      <span className="whitespace-pre">{rest}</span>
    </motion.div>
  )
}

export const EditIllustration = () => (
  <ProductCrop className="min-w-0">
    <div className="py-3 font-mono text-sm/7">
      {LINES.slice(0, FIRST_ADDED).map((line, index) => (
        <Line key={index} index={index} line={line} />
      ))}
      <motion.div
        variants={pop(PROMPT_AT, 4)}
        className="bg-popover ring-foreground/4 @container mx-2 my-1.5 flex h-10 items-center gap-2 rounded-xl pr-1.5 pl-3 font-sans text-sm shadow-lg ring"
      >
        <HugeiconsIcon
          icon={SparklesIcon}
          strokeWidth={2}
          className="text-primary size-4 shrink-0"
        />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-pre">
          <Typed at={TYPE_AT} step={TYPE_STEP} text={PROMPT} />
        </span>
        <motion.span
          inert
          variants={appear(REWRITE_AT + 0.3)}
          className="hidden shrink-0 gap-1 @2xs:flex"
        >
          <Button variant="ghost-muted" size="xs">
            Reject
          </Button>
          <Button size="xs">Accept</Button>
        </motion.span>
      </motion.div>
      {LINES.slice(FIRST_ADDED).map((line, index) => (
        <Line key={index} index={FIRST_ADDED + index} line={line} />
      ))}
    </div>
  </ProductCrop>
)
