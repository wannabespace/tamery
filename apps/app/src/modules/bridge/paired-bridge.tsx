import { Button } from '@tamery/ui/components/button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'

import { FetchingReason } from '~/core/connection/fetching-reason'
import type { BridgeStatus } from '~/core/runtime/bridge/bridge'
import { bridge, getBridgeStatusMessage } from '~/core/runtime/bridge/bridge'
import type { BridgePairing } from '~/core/runtime/bridge/pairing'

import { CommandRow } from './command-row'

export const PairedBridge = ({
  pairing,
  status,
}: {
  pairing: BridgePairing
  status: BridgeStatus | null
}) => {
  const info = status && 'info' in status ? status.info : null
  const message = status && getBridgeStatusMessage(status, pairing.name)

  return (
    <SettingsGroup>
      <SettingsRow
        title={
          <>
            Bridge{info && ` ${info.version}`} on{' '}
            <span data-mask>{pairing.name}</span>
          </>
        }
        description={
          status?.state === 'connected' ? (
            <span className="flex items-center gap-2">
              <span className="bg-success size-1.5 rounded-full" />
              {message}
            </span>
          ) : (
            <FetchingReason reason={message ?? 'Checking…'} />
          )
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => bridge.unpair(pairing)}
        >
          Unpair
        </Button>
      </SettingsRow>
      {info && (info.latestVersion || status?.state === 'outdated') && (
        <CommandRow command={info.updateCommand} copied="update">
          {info.latestVersion
            ? `Update available (${info.latestVersion}). Run this on`
            : 'Run this on'}{' '}
          <span data-mask>{pairing.name}</span>, then restart{' '}
          <code className="text-foreground font-mono text-xs">
            tamery bridge
          </code>
          .
        </CommandRow>
      )}
    </SettingsGroup>
  )
}
