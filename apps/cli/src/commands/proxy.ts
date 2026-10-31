import process from 'node:process'

import { command } from '@drizzle-team/brocli'
import { serve } from '@hono/node-server'
import { ORPCError, os, ValidationError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { createQueryRouter } from '@tamery/query-proxy'
import { querySerializer } from '@tamery/query-proxy/serializer'
import { LOCAL_PROXY_URL, LOOPBACK_HOST, PORTS } from '@tamery/shared/ports'
import { consola } from 'consola'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'

import { requireSession } from '~/session'

const onSigint = () => {
  consola.info('Shutting down proxy...')
  process.exit(0)
}

export const proxyCommand = command({
  desc: 'Start a local proxy server so the web app can query local connections',
  handler: async () => {
    const session = await requireSession()

    const verifyBrowserSession = async (headers: Headers): Promise<void> => {
      const res = await fetch(`${import.meta.env.API_URL}/auth/get-session`, {
        headers,
      })

      if (!res.ok) {
        throw new Error('Invalid or expired browser session.')
      }

      const data = (await res.json()) as { user?: { id?: string } } | null
      if (!data?.user?.id) {
        throw new Error('Invalid browser session.')
      }

      if (data.user.id !== session.user.id) {
        throw new Error(
          'Browser session belongs to a different user than the CLI session.'
        )
      }
    }

    const orpc = os.$context<{ headers: Headers }>()

    const authed = orpc.use(
      orpc.middleware(async ({ next, context }) => {
        await verifyBrowserSession(context.headers)
        return next({})
      })
    )

    const router = createQueryRouter(authed, {
      connectionString: (input) => {
        if ('connectionString' in input) {
          return input.connectionString
        }
        throw new ORPCError('BAD_REQUEST', {
          message: 'The local proxy runs only connection strings it is sent.',
        })
      },
      owner: () => session.user.id,
    })

    const handler = new RPCHandler(router, {
      interceptors: [
        async (options) => {
          try {
            return await options.next()
          } catch (error) {
            consola.error({
              cause: error instanceof Error ? error.cause : undefined,
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              type:
                error instanceof Error ? error.constructor.name : typeof error,
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

            if (error instanceof Error) {
              throw new ORPCError('INTERNAL_SERVER_ERROR', {
                cause: error,
                message: error.message,
              })
            }

            throw error
          }
        },
      ],
      serializer: querySerializer,
    })

    const app = new Hono()
      .use((c, next) => {
        if (!LOOPBACK_HOST.test(c.req.header('host') ?? '')) {
          throw new HTTPException(403)
        }
        return next()
      })
      .use(
        cors({
          credentials: true,
          origin(origin) {
            const allowedOrigins = [import.meta.env.WEB_URL]
            return origin.endsWith(
              `.${new URL(import.meta.env.WEB_URL).host}`
            ) || allowedOrigins.includes(origin)
              ? origin
              : null
          },
        })
      )
      .get('/health', (c) =>
        c.json({
          ok: true,
          userId: session.user.id,
          version: import.meta.env.VERSION,
        })
      )
      .use('/*', async (c, next) => {
        const { matched, response } = await handler.handle(c.req.raw.clone(), {
          context: { headers: c.req.raw.headers },
        })

        if (matched) {
          return c.newResponse(response.body, response)
        }

        return next()
      })

    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigint)

    serve(
      {
        fetch: app.fetch,
        hostname: '127.0.0.1',
        port: PORTS.LOCAL_PROXY,
      },
      () => {
        consola.box({
          message: [
            `Listening on ${LOCAL_PROXY_URL}`,
            `Signed in as ${session.user.email}`,
            '',
            'The web app will automatically route connections through this proxy.',
            'Press Ctrl+C to stop.',
          ].join('\n'),
          style: { borderColor: 'cyan', borderStyle: 'rounded', padding: 1 },
          title: 'Tamery Local Proxy',
        })
      }
    )
  },
  name: 'proxy',
})
