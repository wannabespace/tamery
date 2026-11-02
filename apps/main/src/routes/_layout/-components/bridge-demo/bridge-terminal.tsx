import { TerminalLine } from '../terminal-line'
import { TerminalWindow } from '../terminal-window'
import { BRIDGE_NAME, LISTENING_STEP, PAIRED_STEP } from './script'

export const BridgeTerminal = ({ step }: { step: number }) => (
  <TerminalWindow title="valerii — zsh" className="sm:w-[54%]">
    <TerminalLine show>
      <span className="text-muted-foreground">$</span> tamery bridge
    </TerminalLine>
    <TerminalLine show>
      <span className="text-primary">◆</span> Tamery bridge{' '}
      <span className="text-muted-foreground">0.1.0</span>
    </TerminalLine>
    <TerminalLine
      show={step >= LISTENING_STEP}
      className="text-muted-foreground"
    >
      <span className="text-primary">●</span> {BRIDGE_NAME} is listening on
      127.0.0.1:26380
    </TerminalLine>
    <TerminalLine show={step >= PAIRED_STEP}>
      <span className="text-success">✓</span> Allowed Chrome on macOS
    </TerminalLine>
  </TerminalWindow>
)
