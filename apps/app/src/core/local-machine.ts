import { isMac } from '@tamery/ui/lib/os'

import { bridge } from '~/core/runtime/bridge/bridge'
import {
  getActivePairing,
  useActivePairing,
} from '~/core/runtime/bridge/pairing'

const pairedClient = () => {
  const pairing = getActivePairing()
  return pairing ? bridge.client(pairing) : null
}

/** What only a computer knows about itself, its databases and skill files: the desktop app asks its own, the web the paired bridge's. */
export const localMachine = {
  findDatabases: async () =>
    window.electron
      ? window.electron.localDatabases.find()
      : ((await pairedClient()?.localDatabases.find()) ?? []),
  listSkills: async () =>
    window.electron
      ? window.electron.localSkills.list()
      : ((await pairedClient()?.localSkills.list()) ?? []),
  unlockDatabase: (connectionString: string) =>
    window.electron
      ? window.electron.localDatabases.unlock(connectionString)
      : pairedClient()?.localDatabases.unlock({ connectionString }),
}

// A bridge's keys stay under `['bridge']`: `clearBridgePairing` drops that prefix, or another pairing would show this computer's databases and skills.
export const useLocalMachine = () => {
  const pairing = useActivePairing()
  if (window.electron) {
    return {
      name: isMac ? 'this Mac' : 'this computer',
      queryKey: ['localMachine'],
    }
  }
  return pairing
    ? {
        name: pairing.name,
        queryKey: ['bridge', 'localMachine', pairing.browserId],
      }
    : null
}
