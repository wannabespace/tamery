import { useAnimationControls, useReducedMotion } from 'motion/react'
import type { PointerEvent } from 'react'
import { useRef } from 'react'

const REPLAY_COOLDOWN_MS = 2500

export const usePlayback = (autoplay: boolean) => {
  const controls = useAnimationControls()
  const lastPlayedAt = useRef(-Infinity)
  const hovered = useRef(false)
  const reduceMotion = useReducedMotion()

  const play = () => {
    if (reduceMotion) {
      // controls.set() never reaches the variant children, so the final frame is played instantly instead.
      void controls.start('shown', { duration: 0 })
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
