import { decryptWithKey, encryptWithKey } from '@tamery/shared/crypto-web'
import { KEYCHAIN_LOCKED_ERROR } from '@tamery/shared/keychain'
import { silently } from '@tamery/shared/utils'
import { Result } from 'better-result'
import { safeStorage } from 'electron'

import { createPrivateStore } from './private-store'

const KEY_BYTES = 32

const store = createPrivateStore<{ wrappedKey?: string }>({
  name: 'encryption-key',
})

let key: Promise<CryptoKey> | null = null
let creation: Promise<boolean> | null = null

const importKey = (encoded: string) =>
  crypto.subtle.importKey(
    'raw',
    new Uint8Array(Buffer.from(encoded, 'base64')),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  )

const saveKey = async (encoded: string) => {
  const wrapped = await safeStorage.encryptStringAsync(encoded)
  store.set('wrappedKey', wrapped.toString('base64'))
}

// A denied prompt must read as locked, never as a wrong key, which the renderer resets.
const unwrapKey = async (wrapped: string) => {
  const decrypted = await Result.tryPromise(() =>
    safeStorage.decryptStringAsync(Buffer.from(wrapped, 'base64'))
  )
  if (decrypted.isErr() || !decrypted.value.result) {
    throw new Error(KEYCHAIN_LOCKED_ERROR)
  }
  const { result: encoded, shouldReEncrypt } = decrypted.value
  if (shouldReEncrypt) {
    // The key already unwrapped: a failed re-wrap must not fail the decrypt, which the renderer reads as a wrong key and signs out.
    await silently(() => saveKey(encoded))
  }
  return importKey(encoded)
}

const deviceKey = () => {
  const wrapped = store.get('wrappedKey')
  if (!wrapped) {
    throw new Error(KEYCHAIN_LOCKED_ERROR)
  }
  key ??= unwrapKey(wrapped)
  return key
}

const create = async () => {
  if (store.has('wrappedKey')) {
    return true
  }

  const available = await safeStorage.isAsyncEncryptionAvailable()
  const plainText =
    process.platform === 'linux' &&
    safeStorage.getSelectedStorageBackend() === 'basic_text'
  if (!available || plainText) {
    return false
  }

  const encoded = Buffer.from(
    crypto.getRandomValues(new Uint8Array(KEY_BYTES))
  ).toString('base64')
  const saved = await Result.tryPromise(() => saveKey(encoded))
  if (saved.isErr()) {
    return false
  }
  key = importKey(encoded)
  return true
}

export const deviceEncryption = {
  createKey: () => {
    creation ??= create()
    return creation
  },
  decrypt: async (encrypted: string) =>
    decryptWithKey(await deviceKey(), encrypted),
  encrypt: async (text: string) => encryptWithKey(await deviceKey(), text),
  reset: async () => {
    // A creation still in flight would write its key after the delete and hand the next account this one's key.
    await creation
    key = null
    creation = null
    store.delete('wrappedKey')
  },
}
