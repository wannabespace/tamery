import { cn } from '@tamery/ui/lib/utils'
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import type { PointerEvent, ReactNode } from 'react'
import { useRef } from 'react'

import { DocsLink } from '~/components/docs-link'
import { pageCardClass, stageClass } from '~/utils/card'

import { OnStageContext } from './product-crop'

const REPLAY_COOLDOWN_MS = 2500

const usePlayback = (autoplay: boolean) => {
  const controls = useAnimationControls()
  const lastPlayedAt = useRef(-Infinity)
  const hovered = useRef(false)
  const reduceMotion = useReducedMotion()

  const play = () => {
    if (reduceMotion) {
      controls.set('shown')
      return
    }
    if (performance.now() - lastPlayedAt.current < REPLAY_COOLDOWN_MS) {
      return
    }
    lastPlayedAt.current = performance.now()
    void controls.start('hidden').then(() => controls.start('shown'))
  }

  return {
    'aria-hidden': true,
    animate: controls,
    initial: autoplay ? 'hidden' : 'shown',
    onPointerLeave: () => {
      hovered.current = false
    },
    // Hover starts on a real mouse move, never on enter: scrolling slides cards under a resting cursor (Chrome even sends it moves with no movement), and a touch drag moves the pointer too.
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const moved = event.movementX !== 0 || event.movementY !== 0
      if (event.pointerType !== 'mouse' || !moved || hovered.current) {
        return
      }
      hovered.current = true
      play()
    },
    onTap: play,
    onViewportEnter: autoplay ? play : undefined,
    viewport: { amount: 0.6, once: true },
  } as const
}

export const FeatureStage = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <OnStageContext value>
    <motion.div
      {...usePlayback(true)}
      className={cn(stageClass, 'group h-112 select-none', className)}
    >
      {children}
    </motion.div>
  </OnStageContext>
)

export const FeatureCard = ({
  children,
  description,
  docsPath,
  fill = false,
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
