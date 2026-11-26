import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { smallItemInsetClassName } from '@tamery/ui/components/item'
import { cn } from '@tamery/ui/lib/utils'
import { useSubscription } from 'seitu/react'

import {
  machinePairings,
  useMachines,
  useThisMachineId,
} from '~/core/runtime/machine/pairing'

import { InstallMachine } from './install-machine'
import type { ListedMachine } from './machine-row'
import { MachineRow } from './machine-row'
import { ThisComputerRow } from './this-computer'
import { ThisComputerAddress } from './this-computer-address'

export const MachineSettings = () => {
  const ownId = useThisMachineId()
  const all = useMachines()
  const machines = all.filter(({ id }) => id !== ownId)
  const pairings = useSubscription(machinePairings)
  const listed: ListedMachine[] = [
    ...machines.map((item) => ({ ...item, isListed: true })),
    ...Object.values(pairings)
      .filter((pairing) => !machines.some(({ id }) => id === pairing.machineId))
      .map((pairing) => ({
        id: pairing.machineId,
        isListed: false,
        name: pairing.name,
        seenAt: null,
        urls: [pairing.url],
      })),
  ]
  return (
    <>
      <p
        className={cn(smallItemInsetClassName, 'text-muted-foreground text-sm')}
      >
        A machine is one of your computers that runs queries for your other
        devices, so they reach its localhost databases, private network and
        database files. Choose one under Runs on in a connection’s settings.
      </p>
      <SettingsGroup title="Your machines">
        {window.electron && (
          <>
            <ThisComputerRow
              name={all.find(({ id }) => id === ownId)?.name ?? null}
            />
            <ThisComputerAddress />
          </>
        )}
        {listed.map((item) => (
          <MachineRow
            key={item.id}
            listed={item}
            pairing={pairings[item.id] ?? null}
          />
        ))}
        {!window.electron && listed.length === 0 && (
          <SettingsRow
            title="No machines yet"
            description="Add the computer that reaches your databases."
          />
        )}
      </SettingsGroup>
      <InstallMachine />
    </>
  )
}
