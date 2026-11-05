import '@tamery/shared/arktype-config'
import process from 'node:process'

import { ORPCError, ValidationError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { runInBackground } from '@tamery/shared/background'
import { isDevelopmentOrigin, ORIGINS } from '@tamery/shared/origins'
import { sanitizeLogData } from '@tamery/shared/sanitize-log'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { env, nodeEnv } from './env'
import { handleAuth } from './lib/auth'
import { sendEmail } from './lib/resend'
import { shutdown } from './lib/shutdown'
import { createContext } from './orpc/context'
import { router } from './orpc/routers'
import { healthRouter } from './routers/health'
import type { AppVariables } from './variables'

const handler = new RPCHandler(router, {
  interceptors: [
    async ({ next, context, request }) => {
      try {
        return await next()
      } catch (error) {
        if (request.signal?.aborted) {
          throw new ORPCError('CLIENT_CLOSED_REQUEST')
        }

        context.addLogData({
          error: {
            cause: error instanceof Error ? error.cause : undefined,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            type:
              error instanceof Error ? error.constructor.name : typeof error,
          },
        })

        if (error instanceof ORPCError) {
          if (error.cause instanceof ValidationError) {
            const message = error.cause.issues
              .map((issue) =>
                issue.path
                  ? `${issue.path.join('.')}: ${issue.message.toLowerCase()}`
                  : issue.message
              )
              .join(', ')

            throw new ORPCError('BAD_REQUEST', { message })
          }

          throw error
        }

        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'An unexpected error occurred',
        })
      }
    },
  ],
})

const isDesktopVersionOutdated = (
  parsedAppVersion: AppVariables['parsedAppVersion']
) =>
  !!env.MIN_DESKTOP_VERSION &&
  !!parsedAppVersion?.minor &&
  parsedAppVersion.minor < env.MIN_DESKTOP_VERSION

// The share site is left out: it renders other people's rows and calls the API only from its server.
const isTrustedOrigin = (origin: string) =>
  origin === ORIGINS.site ||
  origin === ORIGINS.web ||
  (nodeEnv === 'development' && isDevelopmentOrigin(origin))

const app = new Hono<{
  Variables: AppVariables
}>()
  .use(
    cors({
      credentials: true,
      origin: (origin) => (isTrustedOrigin(origin) ? origin : null),
    })
  )
  .get('/', (c) => c.redirect(env.MAIN_URL))
  .use('*', async (c, next) => {
    const startTime = Date.now()
    const xAppVersion =
      (
        c.req.header('x-app-version') || c.req.header('x-desktop-version')
      )?.split('.') || null
    c.set('logEvent', {})
    const parsedAppVersion = xAppVersion
      ? {
          major: Number(xAppVersion[0]),
          minor: Number(xAppVersion[1]),
          patch: Number(xAppVersion[2]),
        }
      : null
    c.set('parsedAppVersion', parsedAppVersion)
    c.set(
      'isAppOutdated',
      c.req.header('x-desktop') === 'true' &&
        isDesktopVersionOutdated(parsedAppVersion)
    )

    // Logging runs after the downstream handlers; must not return next().
    // oxlint-disable-next-line node/callback-return
    await next()

    const { status } = c.res
    const { method } = c.req
    const path = new URL(c.req.url).pathname
    const userAgent = c.req.header('User-Agent')
    const version = c.req.header('x-app-version')
    const logEvent = c.get('logEvent') || {}

    if (!logEvent.userId && c.req.header('user-id')) {
      logEvent.userId = c.req.header('user-id')
    }

    const logInfo = {
      duration: `${Date.now() - startTime}ms`,
      method,
      path,
      status,
      ...(version ? { version } : {}),
      ...(userAgent ? { userAgent } : {}),
      ...sanitizeLogData(logEvent),
    }

    if (
      status >= 400 &&
      ![401, 403, 404, 409, 499].includes(status) &&
      (status >= 500 || !path.startsWith('/auth/')) &&
      env.ALERTS_EMAIL &&
      !c.req.url.includes('healthcheck.railway.app')
    ) {
      runInBackground(
        sendEmail({
          props: {
            service: 'API',
            text: JSON.stringify(logInfo, null, 2),
          },
          subject: `Alert from API: ${status} ${method} ${c.req.url}`,
          template: 'Alert',
          to: env.ALERTS_EMAIL,
        })
      )
    }

    const log = JSON.stringify(
      logInfo,
      null,
      nodeEnv === 'production' ? undefined : 2
    )

    if (status >= 400) {
      console.error(log)
    } else {
      // oxlint-disable-next-line no-console
      console.info(log)
    }
  })
  .on(['GET', 'POST'], '/auth/*', (c) => {
    const req = c.req.raw

    // Better Auth checks the origin of cookie-carrying requests only. A browser request without an Origin must not pass as
    // the desktop app; a page cannot send `x-desktop` without a preflight the CORS allowlist refuses.
    const passesAsDesktop =
      !req.headers.get('origin') &&
      (!req.headers.has('cookie') || req.headers.get('x-desktop') === 'true')

    if (passesAsDesktop) {
      req.headers.set('origin', 'file://')
    }

    return handleAuth(req)
  })
  .use('/rpc/*', async (c, next) => {
    // CORS only hides the answer: a form on any `*.tamery.app` page still posts with the session cookie, and oRPC takes
    // a multipart body as input. A page cannot send `x-desktop` without a preflight.
    const origin = c.req.header('origin')
    if (
      origin &&
      c.req.header('cookie') &&
      !isTrustedOrigin(origin) &&
      c.req.header('x-desktop') !== 'true'
    ) {
      return c.text('Forbidden', 403)
    }

    const { matched, response } = await handler.handle(c.req.raw.clone(), {
      context: createContext(c),
      prefix: '/rpc',
    })

    if (matched) {
      return c.newResponse(response.body, response)
    }

    return next()
  })
  .route('/health', healthRouter)

process.once('SIGTERM', shutdown)

export default {
  fetch: app.fetch,
  // Bun's 10s default closes event streams between oRPC's 15s keepalive pings (sign-in shows "network error").
  idleTimeout: 60,
  port: Number(process.env.PORT || 3000),
}
