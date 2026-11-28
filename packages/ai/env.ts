import process from 'node:process'

import { type } from 'arktype'

export const envType = type({
  'MISTRAL_API_KEY?': 'string',
  OPENROUTER_API_KEY: 'string',
  'REDIS_CA?': 'string',
  REDIS_URL: 'string',
})

export const env = envType.assert(process.env)
