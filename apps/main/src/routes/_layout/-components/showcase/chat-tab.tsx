import { ArrowUp02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  InputGroup,
  InputGroupButton,
  InputGroupTextarea,
} from '@tamery/ui/components/input-group'
import { AnimatePresence, motion } from 'motion/react'

import { Answer } from './answer'
import type { Frame } from './playback'

export const ChatTab = ({ frame }: { frame: Frame }) => (
  <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={frame.conversation.title}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 py-5 text-sm"
      >
        <Answer frame={frame} />
      </motion.div>
    </AnimatePresence>
    <div className="shrink-0 p-2 pb-4">
      <InputGroup className="relative">
        <InputGroupTextarea
          readOnly
          rows={1}
          value=""
          placeholder="Ask, @ to mention, / for commands"
          className="min-h-20 pb-9"
        />
        <div className="absolute right-1.5 bottom-1.5">
          <InputGroupButton size="icon-round" variant="default">
            <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={2} />
          </InputGroupButton>
        </div>
      </InputGroup>
    </div>
  </div>
)
