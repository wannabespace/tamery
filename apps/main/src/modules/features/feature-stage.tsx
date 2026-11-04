import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { stageClass } from '~/utils/card'

import { usePlayback } from './use-playback'

export const FeatureStage = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <motion.div
    {...usePlayback(true)}
    className={cn(stageClass, 'group h-112 select-none', className)}
  >
    {children}
  </motion.div>
)
