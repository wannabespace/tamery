import { isMac } from '@tamery/ui/lib/os'
import { useSubscription } from 'seitu/react'

import { machine } from '~/core/runtime/machine/machine'
import {
  MACHINE_QUERY_KEY,
  machinePairings,
  useMachineRouteById,
} from '~/core/runtime/machine/pairing'

/** The computer whose databases a connection running on `machineId` can reach: this desktop when `null`, else a paired machine. */
export const useLocalMachine = (machineId: string | null) => {
  const route = useMachineRouteById(machineId)
  if (route?.pairing) {
    const { pairing } = route
    return {
      find: () => machine.client(pairing).localDatabases.find(),
      name: route.name,
      // Under the pairing's key, which unpairing drops, so another pairing never shows this computer's databases.
      queryKey: [MACHINE_QUERY_KEY, pairing.browserId, 'localDatabases'],
    }
  }
  if (!route && window.electron) {
    const { localDatabases } = window.electron
    return {
      find: () => localDatabases.find(),
      name: isMac ? 'this Mac' : 'this computer',
      queryKey: ['localDatabases'],
    }
  }
  return null
}

/** Every computer this app can list databases on: this desktop, as `null`, and each machine it is paired with. */
export const useLocalMachineIds = () => {
  const pairings = useSubscription(machinePairings)
  return [...(window.electron ? [null] : []), ...Object.keys(pairings)]
}
