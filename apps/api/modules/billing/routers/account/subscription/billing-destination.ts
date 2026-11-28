import { type } from 'arktype'

import { env } from '~/env'

const accountOrigin = new URL(env.MAIN_URL).origin
const DESTINATION_PATHS = new Set(['/account', '/account/billing'])

export const billingDestination = type('string').pipe((value, ctx) => {
  const url = URL.parse(value)

  if (
    !url ||
    url.origin !== accountOrigin ||
    url.username ||
    url.password ||
    !DESTINATION_PATHS.has(url.pathname)
  ) {
    return ctx.error('a Tamery account or billing URL')
  }

  return url.href
})
