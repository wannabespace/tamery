import { beforeEach, expect, mock, test } from 'bun:test'

const store = new Map<string, string>()
mock.module('~/lib/redis', () => ({
  redis: {
    getDel: (key: string) => {
      const value = store.get(key) ?? null
      store.delete(key)
      return Promise.resolve(value)
    },
    set: (key: string, value: string, options: { condition?: 'NX' }) => {
      if (!(options.condition === 'NX' && store.has(key))) {
        store.set(key, value)
      }
      return Promise.resolve()
    },
  },
}))

const { bridgeAttestation } = await import('./attestation')

const NONCE = 'a'.repeat(64)
const ORIGIN = 'http://127.0.0.1:26380'

beforeEach(() => {
  store.clear()
})

test('an attestation is taken once', async () => {
  await bridgeAttestation.set(NONCE, ORIGIN, 'user-1')
  expect(await bridgeAttestation.take(NONCE, ORIGIN)).toBe('user-1')
  expect(await bridgeAttestation.take(NONCE, ORIGIN)).toBeNull()
})

test('a nonce attested for one bridge URL is not found for another', async () => {
  await bridgeAttestation.set(NONCE, ORIGIN, 'user-1')
  expect(
    await bridgeAttestation.take(NONCE, 'https://relay.example')
  ).toBeNull()
})

test('a live attestation cannot be overwritten by someone who learned its nonce', async () => {
  await bridgeAttestation.set(NONCE, ORIGIN, 'user-1')
  await bridgeAttestation.set(NONCE, ORIGIN, 'user-2')
  expect(await bridgeAttestation.take(NONCE, ORIGIN)).toBe('user-1')
})
