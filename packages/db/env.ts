import process from 'node:process'

import { type } from 'arktype'

export const nodeEnv = type('"production" | "development" | "test"').assert(
  process.env.NODE_ENV
)

const keyring = type('string').narrow(
  (secrets, ctx) =>
    secrets.split(',').every((secret) => secret.trim().length >= 32) ||
    ctx.reject({
      actual: '',
      expected: 'comma-separated keys of at least 32 characters each',
    })
)

export const envType = type({
  DATABASE_URL: 'string',
  ENCRYPTION_SECRET: keyring,
  USER_KEY_SECRET: keyring,
})

export const env = envType.assert(process.env)
