import { parseBridgeUrl } from '~/core/runtime/bridge/client'
import { useBridgeStatus } from '~/core/runtime/bridge/status'
import { pairingLink } from '~/lib/pairing-link'

import { InstallBridge } from './install-bridge'
import { PairForm } from './pair-form'
import { PairedBridge } from './paired-bridge'

export const BridgeSettings = () => {
  const current = useBridgeStatus()
  // Once paired with the bridge it names, the link has been used: a later visit must not offer it again.
  const link =
    pairingLink !== null && parseBridgeUrl(pairingLink) !== current?.pairing.url
      ? pairingLink
      : null

  return (
    <>
      {current ? <PairedBridge {...current} /> : <InstallBridge />}
      {(!current || link !== null) && (
        <PairForm link={link} replaces={current?.pairing.name ?? null} />
      )}
    </>
  )
}
