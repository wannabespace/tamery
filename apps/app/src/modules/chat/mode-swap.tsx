import { useReducedMotion } from 'motion/react'
import { AnimateView } from 'motion/react-animate-view'
import type { ReactNode } from 'react'

const SWAP = { duration: 0.42, ease: [0.32, 0.72, 0, 1] } as const

/** Cross-fades a region between tables and agent mode as a view transition. The mode must reach it through a transition (`useDeferredValue`), since a sync commit never starts one. */
export const ModeSwap = ({
  children,
  isAgentMode,
}: {
  children: ReactNode
  isAgentMode: boolean
}) => {
  const reduceMotion = useReducedMotion()

  return (
    <AnimateView
      key={isAgentMode ? 'agent' : 'tables'}
      enter={{ opacity: [0, 1], scale: [isAgentMode ? 1.03 : 0.97, 1] }}
      exit={{ opacity: [1, 0], scale: [1, isAgentMode ? 0.97 : 1.03] }}
      transition={reduceMotion ? { duration: 0 } : SWAP}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </AnimateView>
  )
}
