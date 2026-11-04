import { useRef } from 'react'

import { useLoop } from '../use-loop'
import { BridgeTerminal } from './bridge-terminal'
import { BrowserWindow } from './browser-window'
import { REST_STEP, STEPS } from './script'

const STEP_MS = STEPS.map((step) => step.ms)

export const BridgeDemo = () => {
  const ref = useRef<HTMLDivElement>(null)
  const step = useLoop(ref, STEP_MS) ?? REST_STEP
  const focus = STEPS[step]?.focus

  return (
    <div className="-mx-20 mask-b-from-85% px-20 sm:mask-b-from-80%">
      <div
        ref={ref}
        inert
        aria-hidden
        className="grid gap-4 select-none sm:grid-cols-12"
      >
        <BrowserWindow step={step} active={focus !== 'terminal'} />
        <BridgeTerminal step={step} active={focus !== 'browser'} />
      </div>
    </div>
  )
}
