import { MACHINE_URL } from '@tamery/shared/machine'
import { cn } from '@tamery/ui/lib/utils'

import { TerminalLine } from '../terminal-line'
import { TerminalWindow } from '../terminal-window'
import {
  ALLOWED_STEP,
  ASKED_STEP,
  MACHINE_NAME,
  BROWSER_LABEL,
  codeMatchClass,
  focusClass,
  LISTENING_STEP,
  PAIR_CODE,
  YES_STEP,
} from './script'

const Choice = ({ label, selected }: { label: string; selected: boolean }) =>
  selected ? (
    <span>
      <span className="text-success">●</span> {label}
    </span>
  ) : (
    <span className="text-muted-foreground">○ {label}</span>
  )

export const MachineTerminal = ({
  active,
  step,
}: {
  active: boolean
  step: number
}) => (
  <TerminalWindow
    title="valerii — zsh"
    className={cn('relative sm:col-span-5', focusClass(active))}
  >
    <TerminalLine show>
      <span className="text-muted-foreground">$</span> tamery machine
    </TerminalLine>
    <TerminalLine show>
      <span className="text-primary">◆</span> Tamery machine{' '}
      <span className="text-muted-foreground">0.1.0</span>
    </TerminalLine>
    <TerminalLine show={step >= LISTENING_STEP}>
      <span className="text-primary">●</span> {MACHINE_NAME}
      <div className="text-muted-foreground pl-4">
        Listening on {MACHINE_URL}
      </div>
    </TerminalLine>
    <TerminalLine show={step >= ASKED_STEP}>
      <span className="text-primary">◆</span> Allow {BROWSER_LABEL} to run
      queries on this computer? Only if Tamery shows{' '}
      <span
        className={cn('text-primary whitespace-nowrap', codeMatchClass(step))}
      >
        {PAIR_CODE}
      </span>
      .
      <div className="pl-4">
        {step >= ALLOWED_STEP ? (
          <span className="text-muted-foreground">Yes</span>
        ) : (
          <>
            <Choice label="Yes" selected={step >= YES_STEP} />
            <span className="text-muted-foreground"> / </span>
            <Choice label="No" selected={step < YES_STEP} />
          </>
        )}
      </div>
    </TerminalLine>
    <TerminalLine show={step >= ALLOWED_STEP}>
      <span className="text-success">✓</span> Allowed {BROWSER_LABEL}.
    </TerminalLine>
  </TerminalWindow>
)
