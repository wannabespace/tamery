import { useRef } from 'react'

import { useLoop } from '../use-loop'
import { BridgeTerminal } from './bridge-terminal'
import { BrowserWindow } from './browser-window'
import { FINAL_STEP } from './script'

const STEP_MS = [600, 700, 500, 4200]

export const BridgeDemo = () => {
  const ref = useRef<HTMLDivElement>(null)
  const step = useLoop(ref, STEP_MS) ?? FINAL_STEP

  return (
    <div className="-mx-20 mask-b-from-85% px-20 sm:mask-b-from-80%">
      <div
        ref={ref}
        inert
        aria-hidden
        className="relative h-144 select-none sm:h-104"
      >
        <BridgeTerminal step={step} />
        <BrowserWindow step={step} />
      </div>
    </div>
  )
}
