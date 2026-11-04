import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export const TerminalLine = ({
  children,
  className,
  show,
}: {
  children: ReactNode
  className?: string
  show: boolean
}) =>
  show && (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
