import { MACHINE_INSTALL_COMMANDS } from '@tamery/shared/machine'
import { Button } from '@tamery/ui/components/button'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Switch } from '@tamery/ui/components/switch'
import type { ReactNode } from 'react'

import { FetchingReason } from '~/core/connection/fetching-reason'
import { machine } from '~/core/runtime/machine/machine'
import type { MachinePairing } from '~/core/runtime/machine/pairing'
import { setMachineEnabled } from '~/core/runtime/machine/pairing'
import type { MachineStatus } from '~/core/runtime/machine/status'
import { getMachineStatusMessage } from '~/core/runtime/machine/status'
import { posthog } from '~/lib/posthog'

export const PairedMachine = ({
  pairing,
  status,
}: {
  pairing: MachinePairing
  status: MachineStatus | null
}) => {
  const info = status && 'info' in status ? status.info : null
  const message = status && getMachineStatusMessage(status, pairing.name)
  let statusLine: ReactNode = <FetchingReason reason={message ?? 'Checking…'} />
  if (!pairing.enabled) {
    statusLine = 'Off. Queries from this browser use Tamery’s cloud proxy.'
  } else if (status?.state === 'connected') {
    statusLine = (
      <span className="flex items-center gap-2">
        <span className="bg-success size-1.5 rounded-full" />
        {message}
      </span>
    )
  }

  return (
    <SettingsGroup>
      <SettingsRow
        // A title is a flex row: one span keeps the name in the sentence instead of a gap away from it.
        title={
          <span>
            Machine{info && ` ${info.version}`} on{' '}
            <span data-mask>{pairing.name}</span>
          </span>
        }
        description={statusLine}
      >
        <Button variant="outline" size="sm" onClick={() => machine.unpair()}>
          Unpair
        </Button>
      </SettingsRow>
      <SettingsRow
        htmlFor="machine-enabled"
        title={
          <span>
            Run queries on <span data-mask>{pairing.name}</span>
          </span>
        }
        description="Off keeps the pairing, so turning it back on needs no new approval."
      >
        <Switch
          id="machine-enabled"
          size="sm"
          checked={pairing.enabled}
          onCheckedChange={setMachineEnabled}
        />
      </SettingsRow>
      {info && (info.latestVersion || status?.state === 'outdated') && (
        <SettingsRow
          title={
            info.latestVersion
              ? `Update available: ${info.latestVersion}`
              : 'Update required'
          }
          description={
            <>
              Update the machine on <span data-mask>{pairing.name}</span>, then
              restart it.
            </>
          }
        >
          <CopyButton
            variant="outline"
            size="sm"
            text={MACHINE_INSTALL_COMMANDS[info.installer]}
            onClick={() =>
              posthog.capture('machine_command_copied', { copied: 'update' })
            }
          >
            Copy command
          </CopyButton>
        </SettingsRow>
      )}
    </SettingsGroup>
  )
}
