import { setupPortlessEnvs } from '@tamery/shared/portless-env'
import { type } from 'arktype'

import pkg from '../package.json' with { type: 'json' }

// The build inlines the URLs; only a run from source looks them up.
if (!import.meta.env.API_URL) {
  setupPortlessEnvs({
    API_URL: 'api.local.tamery',
    MAIN_URL: 'main.local.tamery',
    WEB_URL: 'app.local.tamery',
  })
}

export const env = type({
  API_URL: 'string.url',
  MAIN_URL: 'string.url',
  VERSION: 'string',
  WEB_URL: 'string.url',
}).assert({
  API_URL: import.meta.env.API_URL,
  MAIN_URL: import.meta.env.MAIN_URL,
  VERSION: pkg.version,
  WEB_URL: import.meta.env.WEB_URL,
})
