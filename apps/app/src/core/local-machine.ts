import type { LocalSkill } from '@tamery/shared/local-skills'
import { LOCAL_SKILLS_PROTOCOL } from '@tamery/shared/machine'
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
import { ensureConnected } from '~/core/runtime/machine/status'

export type LocalSkills =
  | { skills: LocalSkill[]; state: 'listed' }
  | { state: 'outdated' }

/** The computer whose databases and skill files a connection uses: a paired machine it runs on, else this desktop. */
export const useLocalMachine = (runsOn: RunsOn) => {
  const route = useMachineRouteById(runsOn)
  const pairing = route?.pairing
  if (route && pairing) {
    const client = machine.client(pairing)
    return {
      findDatabases: () => client.localDatabases.find(),
      listSkills: async (): Promise<LocalSkills> => {
        const { protocol } = await ensureConnected(pairing)
        return protocol < LOCAL_SKILLS_PROTOCOL
          ? { state: 'outdated' }
          : { skills: await client.localSkills.list(), state: 'listed' }
      },
      name: route.name,
      // Under the pairing's key, which unpairing drops, so another pairing never shows this computer's databases or skills.
      queryKey: [MACHINE_QUERY_KEY, pairing.browserId],
    }
  }
  if (!route && window.electron) {
    const { localDatabases, localSkills } = window.electron
    return {
      findDatabases: () => localDatabases.find(),
      listSkills: async (): Promise<LocalSkills> => ({
        skills: await localSkills.list(),
        state: 'listed',
      }),
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
