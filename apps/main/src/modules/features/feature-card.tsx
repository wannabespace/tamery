import { cn } from '@tamery/ui/lib/utils'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { DocsLink } from '~/components/docs-link'
import { pageCardClass } from '~/utils/card'

import { usePlayback } from './use-playback'

export const FeatureCard = ({
  children,
  description,
  docsPath,
  fill,
  title,
}: {
  children: ReactNode
  description: string
  docsPath: string
  fill?: boolean
  title: string
}) => (
  <div className="flex flex-col gap-5">
    <motion.div
      {...usePlayback(false)}
      className={cn(
        pageCardClass,
        'group relative isolate h-56 overflow-hidden select-none',
        fill && 'md:h-auto md:flex-1'
      )}
    >
      {children}
    </motion.div>
    <div className="flex flex-col items-start gap-1">
      <h3 className="text-lg">{title}</h3>
      <p className="text-muted-foreground text-sm text-pretty">{description}</p>
      <DocsLink className="mt-2" path={docsPath} source="features">
        Learn more
      </DocsLink>
    </div>
  </div>
)
