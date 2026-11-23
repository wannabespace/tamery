import { parseMachineUrl } from '~/core/runtime/machine/client'
import { useMachineStatus } from '~/core/runtime/machine/status'
import { pairingLink } from '~/lib/pairing-link'

import { InstallMachine } from './install-machine'
import { PairForm } from './pair-form'
import { PairedMachine } from './paired-machine'

export const MachineSettings = () => {
  const current = useMachineStatus()
  // Once paired with the machine it names, the link has been used: a later visit must not offer it again.
  const link =
    pairingLink !== null &&
    parseMachineUrl(pairingLink) !== current?.pairing.url
      ? pairingLink
      : null

  return (
    <>
      {current ? <PairedMachine {...current} /> : <InstallMachine />}
      {(!current || link !== null) && (
        <PairForm link={link} replaces={current?.pairing.name ?? null} />
      )}
    </>
  )
}
