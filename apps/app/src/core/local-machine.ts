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

/** What only a computer knows about itself, the databases it finds: the desktop app asks its own, the web the paired bridge's. */
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

/** Null when there is no computer to ask; `key` changes with the computer, `name` says which one it is. */
export const useLocalMachine = () => {
  const pairing = useActivePairing()
  if (window.electron) {
    return { key: 'desktop', name: isMac ? 'this Mac' : 'this computer' }
  }
  return pairing ? { key: pairing.url, name: pairing.name } : null
}
