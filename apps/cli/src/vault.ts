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

const openVault = async () => {
  const stored = await readKey()
  const hasVault = fs.existsSync(configFiles.vault)
  // A new key would leave every secret in the file unreadable for good.
  if (hasVault && !stored.key) {
    throw new Error(
      'The bridge key is gone from the keychain, so the saved secrets cannot be read. Run `tamery logout` to start over.'
    )
  }
  let { key } = stored
  if (key === null) {
    key = randomBytes(32).toString('base64')
    if (stored.keyInFile) {
      configFiles.write(configFiles.key, key)
    } else {
      await Bun.secrets.set({ ...KEYCHAIN_ITEM, value: key })
    }
  }
  const data: VaultData = hasVault
    ? vaultData.assert(
        JSON.parse(
          decrypt({
            encryptedText: fs.readFileSync(configFiles.vault, 'utf-8'),
            secret: key,
          })
        )
      )
    : { account: null, connections: {} }
  const save = () =>
    configFiles.write(
      configFiles.vault,
      encrypt({ secret: key, text: JSON.stringify(data) })
    )
  return { data, keyInFile: stored.keyInFile, save }
}

let opened: ReturnType<typeof openVault> | null = null

const open = () => {
  opened ??= openVault()
  return opened
}

export const vault = {
  account: async () => {
    const { data } = await open()
    return data.account
  },
  connection: async (id: string) => {
    const { data } = await open()
    return data.connections[id] ?? null
  },
  keyInFile: async () => {
    const { keyInFile } = await open()
    return keyInFile
  },
  removeConnection: async (id: string) => {
    const { data, save } = await open()
    if (id in data.connections) {
      data.connections = omit(data.connections, [id])
      save()
    }
  },
  reset: async () => {
    configFiles.remove(configFiles.vault)
    configFiles.remove(configFiles.key)
    await silently(() => Bun.secrets.delete(KEYCHAIN_ITEM))
    opened = null
  },
  setAccount: async (account: VaultData['account']) => {
    const { data, save } = await open()
    data.account = account
    save()
  },
  setConnection: async (id: string, connectionString: string) => {
    const { data, save } = await open()
    data.connections[id] = connectionString
    save()
  },
}
