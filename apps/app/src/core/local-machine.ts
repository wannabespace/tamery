import { isMac } from '@tamery/ui/lib/os'
import { useSubscription } from 'seitu/react'

import { machine } from '~/core/runtime/machine/machine'
import type { RunsOn } from '~/core/runtime/machine/pairing'
import {
  MACHINE_QUERY_KEY,
  machinePairings,
  THIS_COMPUTER,
  useMachineRouteById,
  useMachines,
} from '~/core/runtime/machine/pairing'

/** The computer whose databases a connection can reach: a paired machine it runs on, else this desktop. */
export const useLocalMachine = (runsOn: RunsOn) => {
  const route = useMachineRouteById(runsOn)
  if (route?.pairing) {
    const client = machine.client(route.pairing)
    return {
      findDatabases: () => client.localDatabases.find(),
      name: route.name,
      // Under the pairing's key, which unpairing drops, so another pairing never shows this computer's databases.
      queryKey: [MACHINE_QUERY_KEY, route.pairing.browserId],
    }
  }
  if (!route && window.electron) {
    const { localDatabases } = window.electron
    return {
      findDatabases: () => localDatabases.find(),
      name: isMac ? 'this Mac' : 'this computer',
      queryKey: ['localMachine'],
    }
  }
  return null
}

/**
 * Every computer this app can list databases on: this desktop and each machine it is paired with that the
 * account lists, since a connection runs only on a listed one.
 */
export const useLocalMachineIds = (): RunsOn[] => {
  const pairings = useSubscription(machinePairings)
  const listed = useMachines()
  return [
    ...(window.electron ? [THIS_COMPUTER] : []),
    ...listed.flatMap(({ id }) => (pairings[id] ? [id] : [])),
  ]
}
