import { Spinner } from '@tamery/ui/components/spinner'
import type { ReactNode } from 'react'

import type { SubagentStatus } from './subagents-store'

export const STATUS: Record<SubagentStatus | 'stopped', ReactNode> = {
  done: <span className="text-muted-foreground">Done</span>,
  failed: <span className="text-destructive">Failed</span>,
  running: (
    <span className="text-muted-foreground flex items-center gap-1.5">
      <Spinner className="size-3" />
      Working
    </span>
  ),
  stopped: <span className="text-muted-foreground">Stopped</span>,
  waiting: <span className="text-warning">Needs approval</span>,
}

export const DOT: Record<SubagentStatus, string> = {
  done: 'bg-muted-foreground/50',
  failed: 'bg-destructive',
  running: 'bg-primary animate-pulse',
  waiting: 'bg-warning',
}
