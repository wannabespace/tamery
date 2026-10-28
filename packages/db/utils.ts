import { decrypt, encrypt } from '@conar/shared/utils/crypto-node'
import { customType } from 'drizzle-orm/pg-core'

import { env } from './env'

// A comma-separated secret is a keyring, current key first: the current key encrypts, every
// key is tried on decrypt (AES-GCM's tag rejects the wrong ones). Keep in sync with main's
// packages/db/utils.ts: both apps share one database, so both must accept the same keyring.
// Never collapse the decrypt loop to the current key — rows written before a rotation stop opening.
function resolveKeyring(secrets: string) {
  const keyring = secrets
    .split(',')
    .map(secret => secret.trim())
    .filter(Boolean)
  const [current] = keyring

  if (!current) {
    throw new Error('Encryption key is empty')
  }

  return {
    encrypt: (text: string) => encrypt({ text, secret: current }),
    decrypt(encryptedText: string) {
      for (const secret of keyring) {
        try {
          return decrypt({ encryptedText, secret })
        } catch {}
      }

      throw new Error('Failed to decrypt text')
    },
  }
}

export function encryptedColumn(secrets: string) {
  const keyring = resolveKeyring(secrets)

  return customType<{ data: string; driverData: string }>({
    dataType() {
      return 'text'
    },
    toDriver(value: string) {
      return keyring.encrypt(value)
    },
    fromDriver(driverData: string) {
      return keyring.decrypt(driverData)
    },
  })
}

export function encryptedJson<TData>(name?: string) {
  const keyring = resolveKeyring(env.ENCRYPTION_SECRET)

  return customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'text'
    },
    toDriver(value: TData) {
      return keyring.encrypt(JSON.stringify(value))
    },
    fromDriver(driverData: string): TData {
      return JSON.parse(keyring.decrypt(driverData))
    },
  })(name!)
}

export function encryptedText(name?: string) {
  return encryptedColumn(env.ENCRYPTION_SECRET)(name!)
}
