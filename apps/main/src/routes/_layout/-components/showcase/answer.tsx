import { Bubble, BubbleContent } from '@tamery/ui/components/bubble'
import { CodeBlock } from '@tamery/ui/components/custom/code-block'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tamery/ui/components/table'
import type { MotionProps } from 'motion/react'
import { motion } from 'motion/react'

import type { Frame } from './playback'

const rise = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 6 },
  transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] },
} satisfies MotionProps

export const Answer = ({
  frame: { conversation, result, sql, words },
}: {
  frame: Frame
}) => (
  <>
    <motion.div {...rise} className="flex flex-col">
      <Bubble align="end" variant="muted">
        <BubbleContent>{conversation.question}</BubbleContent>
      </Bubble>
    </motion.div>
    <div className="flex flex-col gap-3">
      <p className="text-pretty">
        {conversation.answer.split(' ').slice(0, words).join(' ')}
      </p>
      {sql && (
        <motion.div {...rise}>
          <CodeBlock
            code={conversation.sql}
            language="sql"
            size="xs"
            variant="field"
          />
        </motion.div>
      )}
      {result && (
        <motion.div {...rise}>
          <Table size="sm">
            <TableHeader>
              <TableRow>
                {conversation.columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversation.rows.map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell>{label}</TableCell>
                  <TableCell variant="numeric">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      )}
    </div>
  </>
)
