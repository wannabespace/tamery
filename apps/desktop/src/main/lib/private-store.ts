import { chmodSync, existsSync } from 'node:fs'

import type { Options } from 'electron-store'
import Store from 'electron-store'

const OWNER_ONLY = 0o600

export const createPrivateStore = <T extends Record<string, unknown>>(
  options: Options<T>
) => {
  const store = new Store<T>({ ...options, configFileMode: OWNER_ONLY })
  // conf applies the mode only when it writes, and a file an older version wrote may never be written again.
  if (existsSync(store.path)) {
    chmodSync(store.path, OWNER_ONLY)
  }
  return store
}
