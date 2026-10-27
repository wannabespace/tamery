import { decrypt, encrypt } from '@tamery/shared/crypto-node'
import { Result } from 'better-result'
import { customType } from 'drizzle-orm/pg-core'

import { env } from './env'

// A comma-separated secret is a keyring, current key first: the current key encrypts, every
// key is tried on decrypt (AES-GCM's tag rejects the wrong ones), so a new key is rotated in
// while old rows still open under a retiring key, then dropped once the rows are re-encrypted.
// Never collapse the decrypt loop to the current key — rows written before a rotation stop opening.
// A key itself must never contain a comma, or it splits into fragments that open nothing.
export const resolveKeyring = (secrets: string) => {
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

const encryptedType = <TData>(
  secrets: string,
  codec: {
    parse: (text: string) => TData
    stringify: (value: TData) => string
  }
) => {
  const keyring = resolveKeyring(secrets)

  return customType<{ data: TData; driverData: string }>({
    dataType() {
      return 'text'
    },
    fromDriver(driverData: string) {
      return codec.parse(keyring.decrypt(driverData))
    },
    toDriver(value: TData) {
      return keyring.encrypt(codec.stringify(value))
    },
  })
}

export const encryptedTextColumn = (secrets: string) =>
  encryptedType<string>(secrets, { parse: String, stringify: String })

export const encryptedJson = <TData>(name?: string) => {
  const column = encryptedType<TData>(env.ENCRYPTION_SECRET, JSON)
  return name === undefined ? column() : column(name)
}

export const encryptedText = (name?: string) => {
  const column = encryptedTextColumn(env.ENCRYPTION_SECRET)
  return name === undefined ? column() : column(name)
}
