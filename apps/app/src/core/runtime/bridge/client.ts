import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { BridgeRouter } from '@tamery/cli/src/bridge/router'
import { querySerializer } from '@tamery/query-proxy/serializer'
import { BRIDGE_RPC_PATH } from '@tamery/shared/bridge'
import { LOOPBACK_HOST } from '@tamery/shared/ports'
import { Result } from 'better-result'
import { memoize } from 'memoza'

export const isLoopbackUrl = (url: string) =>
  LOOPBACK_HOST.test(URL.parse(url)?.host ?? '')

/**
 * Off this computer only `https://` keeps queries and secrets off the wire, and userinfo would hide the real host. On it only
 * `127.0.0.1`, where the bridge listens: `localhost` may resolve to `::1`, where any other process can.
 */
export const parseBridgeUrl = (raw: string) => {
  const url = URL.parse(raw.trim())
  if (!url || url.username || url.password) {
    return null
  }
  return url.protocol === 'https:' ||
    (url.protocol === 'http:' && url.hostname === '127.0.0.1')
    ? url.origin
    : null
}

/** Never the account bearer: the bridge signs in on its own, and the browser proves itself only with its pairing secret. */
export const createBridgeLink = (url: string, secret: string | null) => {
  const loopback = isLoopbackUrl(url)
  return new RPCLink({
    fetch: async (request, init) => {
      // Not yet in the DOM typings: Local Network Access asks for loopback permission only when the request says so.
      const options: RequestInit & { targetAddressSpace?: 'loopback' } = {
        ...init,
        credentials: 'omit',
        redirect: 'error',
        ...(loopback && { targetAddressSpace: 'loopback' }),
      }
      const response = await Result.tryPromise(() =>
        globalThis.fetch(request, options)
      )
      if (response.isOk()) {
        return response.value
      }
      if (init.signal?.aborted) {
        throw response.error.cause
      }
      throw new Error(
        `Tamery can’t reach the bridge at ${url}. Check that \`tamery bridge\` runs there${loopback ? ' and that this browser allows local network access for this site' : ''}.`,
        { cause: response.error.cause }
      )
    },
    headers: () => (secret ? { Authorization: `Bearer ${secret}` } : {}),
    origin: url,
    serializer: querySerializer,
    url: BRIDGE_RPC_PATH,
  })
}

/** For the calls a browser makes before it holds a secret: `hello` and `pair`. */
export const getBridgeClient = memoize((url: string): BridgeRouter =>
  createORPCClient(createBridgeLink(url, null))
)
