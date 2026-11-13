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

export const localMachine = {
  findDatabases: async () =>
    window.electron
      ? window.electron.localDatabases.find()
      : ((await pairedClient()?.localDatabases.find()) ?? []),
  unlockDatabase: (connectionString: string) =>
    window.electron
      ? window.electron.localDatabases.unlock(connectionString)
      : pairedClient()?.localDatabases.unlock({ connectionString }),
}

// A bridge's key stays under `['bridge']`: `clearBridgePairing` drops that prefix, or another pairing would show this computer's databases.
export const useLocalMachine = () => {
  const pairing = useActivePairing()
  if (window.electron) {
    return {
      name: isMac ? 'this Mac' : 'this computer',
      queryKey: ['localDatabases'],
    }
  }
  return pairing
    ? {
        name: pairing.name,
        queryKey: ['bridge', 'localDatabases', pairing.browserId],
      }
    : null
}
