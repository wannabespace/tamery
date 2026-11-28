import type { Context as HonoContext } from 'hono'
import { UAParser } from 'ua-parser-js'

import type { AppVariables } from '~/variables'

export const createContext = (c: HonoContext<{ Variables: AppVariables }>) => {
  const ua = c.req.raw.headers.get('User-Agent')
  const userAgent = ua ? new UAParser(ua) : null

  const parsedAppVersion = c.get('parsedAppVersion')
  const isAppOutdated = c.get('isAppOutdated')

  return {
    addLogData: (data: Record<string, unknown>) => {
      c.set('logEvent', { ...c.get('logEvent'), ...data })
    },
    clientId: c.req.header('x-client-id'),
    headers: c.req.raw.headers,
    isAppOutdated,
    isDesktop: c.req.header('x-desktop') === 'true',
    parsedAppVersion,
    request: c.req.raw,
    setHeader: (key: string, value: string) => {
      c.res.headers.set(key, value)
    },
    userAgent,
  }
}

export type Context = ReturnType<typeof createContext>
