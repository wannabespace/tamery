import { isMac } from '@tamery/ui/lib/os'

import { machine } from '~/core/runtime/machine/machine'
import {
  getActivePairing,
  useActivePairing,
} from '~/core/runtime/machine/pairing'

const pairedClient = () => {
  const pairing = getActivePairing()
  return pairing ? machine.client(pairing) : null
}

export const localMachine = {
  findDatabases: async () =>
    window.electron
      ? window.electron.localDatabases.find()
      : ((await pairedClient()?.localDatabases.find()) ?? []),
}

// A machine's key stays under `['machine']`: `clearMachinePairing` drops that prefix, or another pairing would show this computer's databases.
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
        queryKey: ['machine', 'localDatabases', pairing.browserId],
      }
    : null
}
