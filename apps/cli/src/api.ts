import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ORPCRouter } from '@tamery/api/orpc/routers'
import { type } from 'arktype'

import { env } from './env'
import { vault } from './vault'

const authorization = (token: string) => ({ authorization: `Bearer ${token}` })

export const api: ORPCRouter = createORPCClient(
  new RPCLink({
    headers: async () => {
      const account = await vault.account()
      return account ? authorization(account.token) : {}
    },
    origin: env.API_URL,
    url: '/rpc',
  })
)

const sessionUser = type({ user: { email: 'string', id: 'string' } }).or('null')

export const account = {
  /** `null` for a token the API no longer accepts. */
  getUser: async (token: string) => {
    const response = await fetch(`${env.API_URL}/auth/get-session`, {
      headers: authorization(token),
    })
    if (!response.ok) {
      throw new Error(`Tamery answered ${response.status}.`)
    }
    return sessionUser.assert(await response.json())?.user ?? null
  },
  signOut: (token: string) =>
    fetch(`${env.API_URL}/auth/sign-out`, {
      headers: authorization(token),
      method: 'POST',
    }),
}
