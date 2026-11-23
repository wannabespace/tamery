import { SettingsGroup } from '@tamery/ui/components/custom/settings-group'
import { useSubscription } from 'seitu/react'

import { parseMachineUrl } from '~/core/runtime/machine/client'
import { machinePairings, useMachines } from '~/core/runtime/machine/pairing'
import { pairingLink } from '~/lib/pairing-link'

import { InstallMachine } from './install-machine'
import type { ListedMachine } from './machine-row'
import { MachineRow } from './machine-row'
import { PairForm } from './pair-form'

export const MachineSettings = () => {
  const machines = useMachines()
  const pairings = useSubscription(machinePairings)
  const listed: ListedMachine[] = [
    ...machines,
    ...Object.values(pairings)
      .filter((pairing) => !machines.some(({ id }) => id === pairing.machineId))
      .map((pairing) => ({
        id: pairing.machineId,
        name: pairing.name,
        seenAt: null,
        urls: [pairing.url],
      })),
  ]
  // Once paired with the machine it names, the link has been used: a later visit must not offer it again.
  const linkOrigin = pairingLink === null ? null : parseMachineUrl(pairingLink)
  const link = Object.values(pairings).some(({ url }) => url === linkOrigin)
    ? null
    : pairingLink

  return (
    <>
      {listed.length > 0 && (
        <SettingsGroup title="Your machines">
          {listed.map((item) => (
            <MachineRow
              key={item.id}
              listed={item}
              pairing={pairings[item.id] ?? null}
            />
          ))}
        </SettingsGroup>
      )}
      <InstallMachine />
      <PairForm link={link} />
    </>
  )
}
