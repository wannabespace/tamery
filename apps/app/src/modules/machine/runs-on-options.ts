import { ComputerIcon } from '@hugeicons/core-free-icons'
import { useSubscription } from 'seitu/react'

import type { AppMenuNode } from '~/components/app-menu'
import {
  machinePairings,
  useConnectionMachineId,
  useMachines,
  useThisMachineId,
  writeConnectionMachine,
} from '~/core/runtime/machine/pairing'

const HERE = window.electron
  ? { description: 'The desktop app on this computer.', label: 'This computer' }
  : {
      description: 'Tamery’s servers, for public hosts.',
      label: 'Tamery Cloud',
    }

const HERE_VALUE = 'here'

const getMachineDescription = (isThisComputer: boolean, isPaired: boolean) => {
  if (isThisComputer) {
    return 'This computer, and your other devices through it.'
  }
  return isPaired ? 'Connected to this app.' : 'Not connected to this app yet.'
}

/** Where a connection can run for this user, `null` being here; empty while the account lists no machine. */
export const useRunsOnOptions = () => {
  const machines = useMachines()
  const pairings = useSubscription(machinePairings)
  const ownId = useThisMachineId()
  if (machines.length === 0) {
    return []
  }
  return [
    { description: HERE.description, label: HERE.label, value: null },
    ...machines.map(({ id, name }) => ({
      description: getMachineDescription(id === ownId, !!pairings[id]),
      label: name,
      value: id,
    })),
  ]
}

/** Per user, so a workspace member who cannot edit the connection still picks where it runs for them. */
export const useRunsOnMenu = (connectionId: string): AppMenuNode | null => {
  const options = useRunsOnOptions()
  const machineId = useConnectionMachineId(connectionId)
  if (options.length === 0) {
    return null
  }
  return {
    icon: ComputerIcon,
    items: [
      {
        onValueChange: (value) =>
          writeConnectionMachine(
            connectionId,
            value === HERE_VALUE ? null : value
          ),
        options: options.map(({ label, value }) => ({
          label,
          value: value ?? HERE_VALUE,
        })),
        type: 'radio',
        value: machineId ?? HERE_VALUE,
      },
    ],
    label: 'Runs on',
    type: 'sub',
  }
}
