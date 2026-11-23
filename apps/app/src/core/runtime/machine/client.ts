import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { MachineRouter } from '@tamery/cli/src/machine/router'
import { querySerializer } from '@tamery/query-proxy/serializer'
import { MACHINE_RPC_PATH } from '@tamery/shared/machine'
import { LOOPBACK_HOST } from '@tamery/shared/ports'
import { Result } from 'better-result'
import { memoize } from 'memoza'

export const isLoopbackUrl = (url: string) =>
  LOOPBACK_HOST.test(URL.parse(url)?.host ?? '')

/**
 * Off this computer only `https://` keeps queries and secrets off the wire, and userinfo would hide the real host. On it only
 * `127.0.0.1`, where the machine listens: `localhost` may resolve to `::1`, where any other process can.
 */
export const parseMachineUrl = (raw: string) => {
  const url = URL.parse(raw.trim())
  if (!url || url.username || url.password) {
    return null
  }
  return url.protocol === 'https:' ||
    (url.protocol === 'http:' && url.hostname === '127.0.0.1')
    ? url.origin
    : null
}

/** Never the account bearer: the machine signs in on its own, and the browser proves itself only with its pairing secret. */
export const createMachineLink = (url: string, secret: string | null) => {
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
        `Tamery can’t reach the machine at ${url}. Check that \`tamery machine\` runs there${loopback ? ' and that this browser allows local network access for this site' : ''}.`,
        { cause: response.error.cause }
      )
    },
    headers: () => (secret ? { Authorization: `Bearer ${secret}` } : {}),
    origin: url,
    serializer: querySerializer,
    url: MACHINE_RPC_PATH,
  })
}

export const getMachineClient = memoize((url: string): MachineRouter =>
  createORPCClient(createMachineLink(url, null))
)
