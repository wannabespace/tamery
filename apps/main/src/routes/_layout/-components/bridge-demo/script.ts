import { cn } from '@tamery/ui/lib/utils'

export const BRIDGE_NAME = 'valerii-mbp'
export const BROWSER_LABEL = 'Chrome on macOS'
export const PAIR_CODE = 'K7QM-4XPA'

export const LISTENING_STEP = 1
export const CONNECT_STEP = 2
export const ASKED_STEP = 3
export const YES_STEP = 4
export const ALLOWED_STEP = 5
export const LOADED_STEP = 6
export const REST_STEP = 7

type Focus = 'both' | 'browser' | 'terminal'

export const STEPS: { focus: Focus; ms: number }[] = [
  { focus: 'terminal', ms: 900 },
  { focus: 'terminal', ms: 1000 },
  { focus: 'browser', ms: 1400 },
  { focus: 'both', ms: 1800 },
  { focus: 'terminal', ms: 700 },
  { focus: 'terminal', ms: 900 },
  { focus: 'browser', ms: 1600 },
  { focus: 'both', ms: 3000 },
]

export const focusClass = (active: boolean) =>
  cn('ease-house transition-opacity duration-300', !active && 'opacity-40')

export const codeMatchClass = (step: number) =>
  cn(
    'ring-primary/60 ease-house rounded-sm transition-shadow duration-300',
    step === ASKED_STEP ? 'ring-2' : 'ring-0'
  )
