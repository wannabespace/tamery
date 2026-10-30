import '@tamery/shared/arktype-config'
import process from 'node:process'

import { ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { sshForwarding } from '@tamery/connection/ssh/forwarding'
import { querySerializer } from '@tamery/query-proxy/serializer'
import { sanitizeLogData } from '@tamery/shared/sanitize-log'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { env, nodeEnv } from './env'
import { createContext } from './orpc/context'
import { router } from './orpc/routers'
import { guardedForwarding } from './public-host'
import type { AppVariables } from './variables'

sshForwarding.use(guardedForwarding)

const handler = new RPCHandler(router, {
  interceptors: [
    async (options) => {
      try {
        return await options.next()
      } catch (error) {
        options.context.addLogData({
          error: {
            cause: error instanceof Error ? error.cause : undefined,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            type:
              error instanceof Error ? error.constructor.name : typeof error,
          },
        })

        if (error instanceof ORPCError) {
          throw error
        }

        if (error instanceof Error) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            cause: error,
            message: sanitizeLogData({ message: error.message }).message,
          })
        }

        throw error
      }
    },
  ],
  serializer: querySerializer,
})

const app = new Hono<{
  Variables: AppVariables
}>()
  .use(
    cors({
      credentials: true,
      origin(origin) {
        const allowedOrigins = ['https://tamery.app']
        if (
          nodeEnv === 'development' &&
          origin.startsWith('http://localhost:')
        ) {
          return origin
        }
        return (origin.startsWith('https://') &&
          origin.endsWith('.tamery.app')) ||
          allowedOrigins.includes(origin)
          ? origin
          : null
      },
    })
  )
  .get('/', (c) => c.redirect(env.MAIN_URL))
  .use('*', async (c, next) => {
    const startTime = Date.now()
    c.set('logEvent', {})

    // Logging runs after the downstream handlers; must not return next().
    // oxlint-disable-next-line node/callback-return
    await next()

    const { status } = c.res
    const { method } = c.req
    const path = new URL(c.req.url).pathname
    const userAgent = c.req.header('User-Agent')
    const version = c.req.header('x-desktop-version')
    const logEvent = c.get('logEvent') || {}

    if (!logEvent.userId && c.req.header('user-id')) {
      logEvent.userId = c.req.header('user-id')
    }

    const body = status >= 400 ? await c.res.clone().text() : undefined

    const logInfo = {
      duration: `${Date.now() - startTime}ms`,
      method,
      path,
      status,
      ...(version ? { version } : {}),
      ...(userAgent ? { userAgent } : {}),
      ...sanitizeLogData({
        ...logEvent,
        ...(body === undefined ? {} : { body }),
      }),
    }

    const log = JSON.stringify(
      logInfo,
      null,
      nodeEnv === 'production' ? undefined : 2
    )

    if (status >= 400) {
      console.error(log)
    } else {
      console.info(log)
    }
  })
  .use('/rpc/*', async (c, next) => {
    const { matched, response } = await handler.handle(c.req.raw.clone(), {
      context: createContext(c),
      prefix: '/rpc',
    })

    if (matched) {
      return c.newResponse(response.body, response)
    }

    return next()
  })

export default {
  fetch: app.fetch,
  // Bun's 10s default cuts off any query that runs longer; 255 is Bun's max.
  idleTimeout: 255,
  port: Number(process.env.PORT || 3004),
}
