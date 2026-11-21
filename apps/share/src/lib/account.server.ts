import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ORPCRouter } from '@tamery/api/orpc/routers'
import { getRequest } from '@tanstack/react-start/server'
import { Result } from 'better-result'

const cookie = () => getRequest().headers.get('cookie') ?? ''

export const api: ORPCRouter = createORPCClient(
  new RPCLink({
    headers: () => ({ cookie: cookie() }),
    origin: import.meta.env.VITE_PUBLIC_API_URL,
    url: '/rpc',
  })
)

export const getSessionUser = async () => {
  const result = await Result.tryPromise(() => api.account.viewer())
  const viewer = result.unwrapOr(null)
  return viewer && !viewer.isAnonymous ? { email: viewer.email } : null
}
