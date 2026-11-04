import process from 'node:process'

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
  API_URL: 'string',
  MAIN_URL: 'string',
  PROXY_SHARED_SECRET: 'string >= 32',
})

export const env = envType.assert(process.env)
