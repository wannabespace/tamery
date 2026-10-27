import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { objectEntries } from '@tamery/shared/utils'

import { kms, KmsConfigError } from './kms'

const WRAPPED_SECRETS = {
  ENCRYPTION_SECRET: 'ENCRYPTION_SECRET_WRAPPED',
  USER_KEY_SECRET: 'USER_KEY_SECRET_WRAPPED',
} as const

const RETRY_BACKOFF_MS = [2000, 4000, 8000, 16_000]

const unwrap = async (
  name: string,
  ciphertext: string,
  attempt = 0
): Promise<string> => {
  try {
    return await kms.unwrap(ciphertext)
  } catch (error) {
    if (error instanceof KmsConfigError || attempt >= RETRY_BACKOFF_MS.length) {
      throw error
    }

    console.error(`KMS unwrap of ${name} failed, retrying`, error)
    await delay(RETRY_BACKOFF_MS[attempt])

    return unwrap(name, ciphertext, attempt + 1)
  }
}

await Promise.all(
  objectEntries(WRAPPED_SECRETS).map(async ([plaintextVar, wrappedVar]) => {
    if (process.env[plaintextVar]) {
      return
    }

    const ciphertext = process.env[wrappedVar]

    if (!ciphertext) {
      throw new Error(`Set ${plaintextVar} (dev) or ${wrappedVar} (production)`)
    }

    process.env[plaintextVar] = await unwrap(plaintextVar, ciphertext)
  })
)
