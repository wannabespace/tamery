import { BRIDGE_INSTALL_COMMANDS } from '@tamery/shared/bridge'
import { Button } from '@tamery/ui/components/button'
import { CopyButton } from '@tamery/ui/components/custom/copy-button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Switch } from '@tamery/ui/components/switch'
import type { ReactNode } from 'react'

import { FetchingReason } from '~/core/connection/fetching-reason'
import { bridge } from '~/core/runtime/bridge/bridge'
import type { BridgePairing } from '~/core/runtime/bridge/pairing'
import { setBridgeEnabled } from '~/core/runtime/bridge/pairing'
import type { BridgeStatus } from '~/core/runtime/bridge/status'
import { getBridgeStatusMessage } from '~/core/runtime/bridge/status'
import { posthog } from '~/lib/posthog'

export const PairedBridge = ({
  pairing,
  status,
}: {
  pairing: BridgePairing
  status: BridgeStatus | null
}) => {
  const info = status && 'info' in status ? status.info : null
  const message = status && getBridgeStatusMessage(status, pairing.name)
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
            Bridge{info && ` ${info.version}`} on{' '}
            <span data-mask>{pairing.name}</span>
          </span>
        }
        description={statusLine}
      >
        <Button variant="outline" size="sm" onClick={() => bridge.unpair()}>
          Unpair
        </Button>
      </SettingsRow>
      <SettingsRow
        htmlFor="bridge-enabled"
        title={
          <span>
            Run queries on <span data-mask>{pairing.name}</span>
          </span>
        }
        description="Off keeps the pairing, so turning it back on needs no new approval."
      >
        <Switch
          id="bridge-enabled"
          size="sm"
          checked={pairing.enabled}
          onCheckedChange={setBridgeEnabled}
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
              Update the bridge on <span data-mask>{pairing.name}</span>, then
              restart it.
            </>
          }
        >
          <CopyButton
            variant="outline"
            size="sm"
            text={BRIDGE_INSTALL_COMMANDS[info.installer]}
            onClick={() =>
              posthog.capture('bridge_command_copied', { copied: 'update' })
            }
          >
            Copy command
          </CopyButton>
        </SettingsRow>
      )}
    </SettingsGroup>
  )
}
