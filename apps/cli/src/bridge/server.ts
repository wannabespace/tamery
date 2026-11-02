import { log } from '@clack/prompts'
import { ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { querySerializer } from '@tamery/query-proxy/serializer'
import { BRIDGE_RPC_PATH } from '@tamery/shared/bridge'
import { LOOPBACK_HOST } from '@tamery/shared/ports'
import { redactSecrets } from '@tamery/shared/sanitize-log'
import { toError } from '@tamery/shared/utils'

import { env } from '../env'
import type { createRouter } from './router'

/** Bun's maximum; its 10 s default cuts off any query that runs longer. */
const IDLE_TIMEOUT_S = 255

const PREFLIGHT_HEADERS = {
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-private-network': 'true',
  'access-control-max-age': '600',
}

/** A misconfigured tunnel or a stray page repeats its request; the terminal says so once. */
let lastRefused: string | null = null

const refuse = (status: number, reason: string) => {
  if (reason !== lastRefused) {
    lastRefused = reason
    log.warn(reason)
  }
  return new Response(reason, { status })
}

export const serveBridge = ({
  port,
  publicUrl,
  router,
}: {
  port: number
  publicUrl: URL | null
  router: ReturnType<typeof createRouter>
}) => {
  const webOrigin = new URL(env.WEB_URL).origin
  const handler = new RPCHandler(router, {
    interceptors: [
      async ({ next }) => {
        try {
          return await next()
        } catch (error) {
          if (error instanceof ORPCError) {
            throw error
          }
          // The database's own message (a syntax error, a refused login) is what the app shows the user.
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            cause: error,
            message: redactSecrets(toError(error).message),
          })
        }
      },
    ],
    serializer: querySerializer,
  })

  return Bun.serve({
    fetch: async (request) => {
      const host = request.headers.get('host') ?? ''
      if (!LOOPBACK_HOST.test(host) && host !== publicUrl?.host) {
        return refuse(
          421,
          `Refused a request for ${host}. To reach the bridge there, start it with --public-url https://${host}.`
        )
      }
      // A request with no Origin is not a browser's; the browser secret still gates it.
      const origin = request.headers.get('origin')
      if (origin !== null && origin !== webOrigin) {
        return refuse(
          403,
          `Refused a request from ${origin}: only ${webOrigin} may use the bridge.`
        )
      }
      const cors: Record<string, string> = origin
        ? { 'access-control-allow-origin': origin, vary: 'origin' }
        : {}
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: { ...cors, ...PREFLIGHT_HEADERS },
          status: 204,
        })
      }
      const { matched, response } = await handler.handle(request, {
        context: { authorization: request.headers.get('authorization') },
        prefix: BRIDGE_RPC_PATH,
      })
      const answer = matched
        ? response
        : new Response('Not found', { status: 404 })
      for (const [name, value] of Object.entries(cors)) {
        answer.headers.set(name, value)
      }
      return answer
    },
    hostname: '127.0.0.1',
    idleTimeout: IDLE_TIMEOUT_S,
    port,
  })
}
