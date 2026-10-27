import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { Result } from 'better-result'
import { customType } from 'drizzle-orm/pg-core'

import { env } from './env'

// A comma-separated secret is a keyring, current key first: the current key encrypts, every
// key is tried on decrypt (AES-GCM's tag rejects the wrong ones), so a new key is rotated in
// while old rows still open under a retiring key, then dropped once the rows are re-encrypted.
// Never collapse the decrypt loop to the current key — rows written before a rotation stop opening.
const resolveKeyring = (secrets: string) => {
  const keyring = secrets
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean)
  const [current] = keyring

  if (!current) {
    throw new Error('Encryption key is empty')
  }

  return {
    decrypt(encryptedText: string) {
      for (const secret of keyring) {
        const decrypted = Result.try(() => decrypt({ encryptedText, secret }))
        if (!decrypted.isErr()) {
          return decrypted.value
        }
      }

      throw new Error('Failed to decrypt text')
    },
    encrypt: (text: string) => encrypt({ secret: current, text }),
  }
}

export const encryptedColumn = (secrets: string) => {
  const keyring = resolveKeyring(secrets)

  return customType<{ data: string; driverData: string }>({
    dataType() {
      return 'text'
    },
    fromDriver(driverData: string) {
      return keyring.decrypt(driverData)
    },
    toDriver(value: string) {
      return keyring.encrypt(value)
    },
  })
}

export const encryptedJson = <TData>(name?: string) => {
  const keyring = resolveKeyring(env.ENCRYPTION_SECRET)
  const column = customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'text'
    },
    fromDriver(driverData: string): TData {
      return JSON.parse(keyring.decrypt(driverData))
    },
    toDriver(value: TData) {
      return keyring.encrypt(JSON.stringify(value))
    },
  })
  return name === undefined ? column() : column(name)
}

export const encryptedText = (name?: string) => {
  const column = encryptedColumn(env.ENCRYPTION_SECRET)
  return name === undefined ? column() : column(name)
}
