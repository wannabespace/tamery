import process from 'node:process'

import { type } from 'arktype'

export const nodeEnv = type('"production" | "development" | "test"').assert(process.env.NODE_ENV)

const envType = type({
  API_URL: 'string',
  MAIN_URL: 'string',
  MIN_DESKTOP_VERSION: type('string').pipe(s => Number(s)),
  DATABASE_URL: 'string',
  ALERTS_EMAIL: 'string',
  ENCRYPTION_SECRET: 'string',
  BETTER_AUTH_SECRET: 'string',
  STRIPE_SECRET_KEY: 'string',
  STRIPE_WEBHOOK_SECRET: 'string',
  STRIPE_MONTH_PRICE_ID: 'string',
  STRIPE_ANNUAL_PRICE_ID: 'string',
  REDIS_URL: 'string',
  POSTHOG_TOKEN: 'string',
  RESEND_API_KEY: 'string',
  RESEND_FROM_EMAIL: 'string',
  OPENROUTER_API_KEY: 'string',
  GOOGLE_CLIENT_ID: 'string',
  GOOGLE_CLIENT_SECRET: 'string',
  GITHUB_CLIENT_ID: 'string',
  GITHUB_CLIENT_SECRET: 'string',
  BANNER_TEXT: 'string?',
  EXA_API_KEY: 'string',
  CONTEXT7_API_KEY: 'string',
  GITHUB_TOKEN: 'string',
  TODESKTOP_WEBHOOK_SECRET: 'string',
  PROXY_SHARED_SECRET: 'string',
  INFISICAL_CLIENT_ID: 'string?',
  INFISICAL_CLIENT_SECRET: 'string?',
  INFISICAL_KMS_KEY_ID: 'string?',
  INFISICAL_SITE_URL: 'string?',
})

const devOptionalEnvs = [
  'MIN_DESKTOP_VERSION',
  'ALERTS_EMAIL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_MONTH_PRICE_ID',
  'STRIPE_ANNUAL_PRICE_ID',
  'POSTHOG_TOKEN',
  'RESEND_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'EXA_API_KEY',
  'CONTEXT7_API_KEY',
  'GITHUB_TOKEN',
  'TODESKTOP_WEBHOOK_SECRET',
] satisfies (keyof typeof envType.infer)[]

export const env =
  nodeEnv === 'production' || nodeEnv === 'test'
    ? envType.assert(process.env)
    : type
        .and(envType.omit(...devOptionalEnvs), envType.pick(...devOptionalEnvs).partial())
        .assert(process.env)
