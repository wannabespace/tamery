import process from 'node:process'

import { envType as dbEnvType } from '@tamery/db/env'
import { setupPortlessEnvs } from '@tamery/shared/portless-env'
import { type } from 'arktype'

export const nodeEnv = type('"production" | "development" | "test"').assert(
  process.env.NODE_ENV
)

if (nodeEnv === 'development') {
  setupPortlessEnvs({
    API_URL: 'api.local.tamery',
    MAIN_URL: 'main.local.tamery',
  })
}

const envType = type({
  ALERTS_EMAIL: 'string',
  API_URL: 'string',
  BANNER_TEXT: 'string?',
  BETTER_AUTH_SECRET: 'string',
  CONTEXT7_API_KEY: 'string',
  EXA_API_KEY: 'string',
  GITHUB_CLIENT_ID: 'string',
  GITHUB_CLIENT_SECRET: 'string',
  GITHUB_TOKEN: 'string',
  GOOGLE_CLIENT_ID: 'string',
  GOOGLE_CLIENT_SECRET: 'string',
  INFISICAL_CLIENT_ID: 'string?',
  INFISICAL_CLIENT_SECRET: 'string?',
  INFISICAL_KMS_KEY_ID: 'string?',
  MAIN_URL: 'string',
  MIN_DESKTOP_VERSION: type('string').pipe(Number),
  MISTRAL_API_KEY: 'string',
  OPENROUTER_API_KEY: 'string',
  POSTHOG_TOKEN: 'string?',
  PROXY_SHARED_SECRET: 'string',
  REDIS_URL: 'string',
  RESEND_API_KEY: 'string',
  STRIPE_ANNUAL_PRICE_ID: 'string',
  STRIPE_MONTH_PRICE_ID: 'string',
  STRIPE_SECRET_KEY: 'string',
  STRIPE_WEBHOOK_SECRET: 'string',
  TODESKTOP_WEBHOOK_SECRET: 'string',
}).merge(dbEnvType)

const devOptionalEnvs = [
  'MIN_DESKTOP_VERSION',
  'ALERTS_EMAIL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_MONTH_PRICE_ID',
  'STRIPE_ANNUAL_PRICE_ID',
  'RESEND_API_KEY',
  'OPENROUTER_API_KEY',
  'MISTRAL_API_KEY',
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
    : envType
        .omit(...devOptionalEnvs)
        .merge(envType.pick(...devOptionalEnvs).partial())
        .assert(process.env)
