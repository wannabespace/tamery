import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import process from 'node:process'

import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { omit, silently } from '@tamery/shared/utils'
import { type } from 'arktype'
import { Result } from 'better-result'

import { configFiles } from './config-files'

const KEYCHAIN_ITEM = { name: 'bridge-key', service: 'app.tamery.cli' }

const vaultData = type({
  account: type({ email: 'string', id: 'string', token: 'string' }).or('null'),
  connections: { '[string]': 'string' },
})

type VaultData = typeof vaultData.infer

/** A headless Linux box usually has no Secret Service, so the key sits in a file beside the vault there. */
const readKey = async () => {
  if (fs.existsSync(configFiles.key)) {
    return { key: fs.readFileSync(configFiles.key, 'utf-8'), keyInFile: true }
  }
  const stored = await Result.tryPromise(() => Bun.secrets.get(KEYCHAIN_ITEM))
  if (stored.isOk()) {
    return { key: stored.value, keyInFile: false }
  }
  if (process.platform === 'linux' && !fs.existsSync(configFiles.vault)) {
    return { key: null, keyInFile: true }
  }
  throw new Error(
    'The keychain refused the bridge key. Unlock it and run the command again.'
  )
}

const getKey = async () => {
  const stored = await readKey()
  if (stored.key !== null) {
    return stored.key
  }
  // A new key would leave every secret in the file unreadable for good.
  if (fs.existsSync(configFiles.vault)) {
    throw new Error(
      'The bridge key is gone from the keychain, so the saved secrets cannot be read. Run `tamery logout` to start over.'
    )
  }
  const key = randomBytes(32).toString('base64')
  if (stored.keyInFile) {
    configFiles.write(configFiles.key, key)
  } else {
    await Bun.secrets.set({ ...KEYCHAIN_ITEM, value: key })
  }
  return key
}

const EMPTY: VaultData = { account: null, connections: {} }

const readData = (key: string): VaultData =>
  fs.existsSync(configFiles.vault)
    ? vaultData.assert(
        JSON.parse(
          decrypt({
            encryptedText: fs.readFileSync(configFiles.vault, 'utf-8'),
            secret: key,
          })
        )
      )
    : EMPTY

/**
 * Key and file are read on every call, never kept: `tamery login` and `tamery logout` replace both from another process
 * while a bridge runs, and a copy held here would write the old account back under a key that is gone.
 */
const read = async () =>
  fs.existsSync(configFiles.vault) ? readData(await getKey()) : EMPTY

/** Nothing awaits between reading and writing, so two changes in this process never drop each other. */
const change = async (apply: (data: VaultData) => VaultData) => {
  const key = await getKey()
  configFiles.write(
    configFiles.vault,
    encrypt({ secret: key, text: JSON.stringify(apply(readData(key))) })
  )
}

export const vault = {
  account: async () => {
    const { account } = await read()
    return account
  },
  connection: async (id: string) => {
    const { connections } = await read()
    return connections[id] ?? null
  },
  keyInFile: async () => {
    const { keyInFile } = await readKey()
    return keyInFile
  },
  removeConnection: (id: string) =>
    change((data) => ({ ...data, connections: omit(data.connections, [id]) })),
  reset: async () => {
    configFiles.remove(configFiles.vault)
    configFiles.remove(configFiles.key)
    await silently(() => Bun.secrets.delete(KEYCHAIN_ITEM))
  },
  setAccount: (account: VaultData['account']) =>
    change((data) => ({ ...data, account })),
  setConnection: (id: string, connectionString: string) =>
    change((data) => ({
      ...data,
      connections: { ...data.connections, [id]: connectionString },
    })),
}
