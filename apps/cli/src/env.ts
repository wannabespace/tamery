import { setupPortlessEnvs } from '@tamery/shared/portless-env'
import { type } from 'arktype'

if (!import.meta.env.VERSION) {
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
  VERSION: import.meta.env.VERSION ?? '0.0.0-dev',
  WEB_URL: import.meta.env.WEB_URL,
})
