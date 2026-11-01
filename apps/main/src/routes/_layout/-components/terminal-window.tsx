import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { WindowButtons } from './window-buttons'

/** A terminal on the page: `className` places and sizes it in its demo. */
export const TerminalWindow = ({
  children,
  className,
  title,
}: {
  children: ReactNode
  className?: string
  title: string
}) => (
  <div
    className={cn(
      'bg-background ring-foreground/4 absolute top-0 left-0 flex w-full flex-col overflow-hidden rounded-xl shadow-xl ring',
      className
    )}
  >
    <div className="relative flex h-9 shrink-0 items-center gap-2 border-b px-3">
      <WindowButtons muted />
      <span className="text-muted-foreground absolute inset-x-0 text-center text-xs">
        {title}
      </span>
    </div>
    <div className="flex min-h-72 flex-col gap-3 p-4 font-mono text-xs/5">
      {children}
    </div>
  </div>
)

/** One line that rises in once its step arrives. */
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
