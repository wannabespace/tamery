import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'

import type { Subagent, SubagentStatus } from './subagents-store'

export const STATUS: Record<SubagentStatus | 'stopped', ReactNode> = {
  done: (
    <span className="text-muted-foreground flex items-center gap-1">
      <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3" />
      Done
    </span>
  ),
  failed: <span className="text-destructive">Failed</span>,
  running: <span className="text-muted-foreground shimmer">Working</span>,
  stopped: <span className="text-muted-foreground">Stopped</span>,
  waiting: <span className="text-warning">Needs approval</span>,
}

export const DOT: Record<SubagentStatus, string> = {
  done: 'bg-muted-foreground/50',
  failed: 'bg-destructive',
  running: 'bg-primary',
  waiting: 'bg-warning',
}

export const ACTIVE: [Subagent['status'], string][] = [
  ['running', 'working'],
  ['waiting', 'waiting for you'],
]
