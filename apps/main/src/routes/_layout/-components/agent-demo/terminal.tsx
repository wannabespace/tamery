import { cn } from '@tamery/ui/lib/utils'

import { TerminalLine } from '../terminal-line'
import { TerminalWindow } from '../terminal-window'
import {
  APPROVAL_STEP,
  DONE_STEP,
  ORDER_ID,
  UPDATE_SQL,
  UPDATED_STEP,
} from './script'

const ToolCall = ({ name, sql }: { name: string; sql: string }) => (
  <>
    <div>
      <span className="text-primary">⏺</span> tamery · {name}
      <span className="text-muted-foreground"> (MCP)</span>
    </div>
    <div className="text-muted-foreground truncate pl-4">⎿ {sql}</div>
  </>
)

export const Terminal = ({ step }: { step: number }) => (
  <TerminalWindow title="claude — storefront" className="sm:w-[62%]">
    <TerminalLine show>
      <span className="text-muted-foreground">&gt;</span> Refund order{' '}
      {ORDER_ID}, the customer cancelled
    </TerminalLine>
    <TerminalLine show={step >= 1}>
      <ToolCall
        name="query"
        sql={`SELECT status FROM orders WHERE id = ${ORDER_ID}`}
      />
      <TerminalLine show={step >= 2} className="text-muted-foreground pl-4">
        ⎿ 1 row · pending
      </TerminalLine>
    </TerminalLine>
    <TerminalLine show={step >= 3}>
      <ToolCall name="execute" sql={UPDATE_SQL} />
      <TerminalLine
        show={step >= APPROVAL_STEP}
        className={cn(
          'text-muted-foreground pl-4',
          step < UPDATED_STEP && 'animate-pulse'
        )}
      >
        ⎿{' '}
        {step < UPDATED_STEP
          ? 'Waiting for approval in Tamery…'
          : '1 row updated'}
      </TerminalLine>
    </TerminalLine>
    <TerminalLine show={step >= DONE_STEP} className="font-sans text-sm">
      Done. Order {ORDER_ID} is refunded.
    </TerminalLine>
  </TerminalWindow>
)
