import { AiChat02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Bubble, BubbleContent } from '@tamery/ui/components/bubble'
import { Button } from '@tamery/ui/components/button'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import { motion } from 'motion/react'

import { ProductCrop } from './product-crop'
import { appear, rise, vanish } from './variants'

const QUESTION = 'Mark order 58309 as shipped.'
const ANSWER = 'It is one pending order. The change waits for your Run:'
const DONE = 'Done. Order 58309 is shipped.'

const STREAM_AT = 0.4
const WORD_STEP = 0.035
const CARD_AT = STREAM_AT + ANSWER.split(' ').length * WORD_STEP + 0.15
const PRESS_AT = CARD_AT + 0.8
const RAN_AT = PRESS_AT + 0.3
const DONE_AT = RAN_AT + 0.25

const SQL = `UPDATE orders
SET status = 'shipped'
WHERE id = 58309`

const Words = ({ at, text }: { at: number; text: string }) => (
  <p className="text-pretty">
    {text.split(' ').map((word, index) => (
      <motion.span key={index} variants={appear(at + index * WORD_STEP)}>
        {`${word} `}
      </motion.span>
    ))}
  </p>
)

export const AskIllustration = () => (
  <ProductCrop stage className="min-w-0">
    <div inert className="bg-body/50 flex h-8 items-stretch">
      <span className="bg-background font-row flex items-center gap-1.5 border-r pr-8 pl-3 text-sm">
        <HugeiconsIcon
          icon={AiChat02Icon}
          strokeWidth={2}
          className="text-primary size-3.5"
        />
        Ship order 58309
      </span>
      <div className="flex-1 border-b" />
    </div>
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-3 py-5 text-sm">
      <motion.div variants={rise(0.1)} className="flex flex-col">
        <Bubble align="end" variant="muted">
          <BubbleContent>{QUESTION}</BubbleContent>
        </Bubble>
      </motion.div>
      <Words at={STREAM_AT} text={ANSWER} />
      <motion.div
        variants={rise(CARD_AT)}
        className="bg-background ring-foreground/4 flex flex-col gap-2 rounded-xl p-2 ring"
      >
        <CodeBlock code={SQL} language="sql" size="xs" variant="field" />
        <p className="text-muted-foreground pl-1 text-xs">
          The database estimates it changes about 1 row.
        </p>
        <div className="grid">
          <motion.div
            variants={vanish(RAN_AT)}
            className="col-start-1 row-start-1 flex items-center gap-1.5"
          >
            <span className="text-muted-foreground mr-auto pl-1 text-xs">
              Runs on shop once you approve
            </span>
            <Button size="sm" variant="ghost-muted">
              Decline
            </Button>
            <motion.span
              variants={{
                hidden: { scale: 1 },
                shown: {
                  scale: [1, 0.94, 1],
                  transition: { delay: PRESS_AT, duration: 0.25 },
                },
              }}
            >
              <Button size="sm">Run</Button>
            </motion.span>
          </motion.div>
          <motion.span
            variants={appear(RAN_AT)}
            className="text-muted-foreground col-start-1 row-start-1 flex items-center gap-1.5 self-center pl-1 text-xs"
          >
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              className="size-3.5"
            />
            1 row updated
          </motion.span>
        </div>
      </motion.div>
      <Words at={DONE_AT} text={DONE} />
    </div>
  </ProductCrop>
)
