import { log } from '@clack/prompts'
import { os } from '@orpc/server'
import type { RouterClient } from '@orpc/server'
import { createQueryRouter } from '@tamery/query-proxy'
import { BRIDGE_PROTOCOL, bridgeKey } from '@tamery/shared/bridge'
import { type } from 'arktype'

import { env } from '../env'
import { paint } from '../paint'
import { updates } from '../update-check'
import { connections } from './connections'
import { authErrors, pairErrors, queryErrors } from './errors'
import { pairings } from './pairings'

const base = os.$context<{ authorization: string | null }>()

const authed = base.errors(authErrors).use(({ context, errors, next }) => {
  const browserId = pairings.authenticate(context.authorization)
  if (!browserId) {
    throw errors.UNAUTHORIZED()
  }
  return next({ context: { browserId } })
})

export const createRouter = ({
  name,
  userId,
}: {
  name: string
  userId: string
}) => {
  const getInfo = () => ({
    latestVersion: updates.latest(),
    name,
    protocol: BRIDGE_PROTOCOL,
    updateCommand: updates.command,
    version: env.VERSION,
  })

  return {
    bridge: {
      /** `proof` is `null` for a browser this bridge never paired or has forgotten. */
      hello: base
        .input(type({ browserId: 'string | null', nonce: 'string.hex == 64' }))
        .handler(({ input }) => {
          const hash = input.browserId && pairings.getHash(input.browserId)
          return {
            ...getInfo(),
            proof: hash ? bridgeKey.proof(hash, input.nonce) : null,
          }
        }),
      /** Checks the account before spending the code, so a browser signed in elsewhere leaves nothing behind. */
      pair: base
        .errors(pairErrors)
        .input(type({ code: 'string', label: 'string', userId: 'string' }))
        .handler(({ errors, input }) => {
          if (!pairings.isCode(input.code)) {
            throw errors.INVALID_CODE()
          }
          if (input.userId !== userId) {
            throw errors.OTHER_ACCOUNT()
          }
          log.success(`Paired ${paint.bold(input.label || 'a browser')}.`)
          return { ...pairings.pair(input.label), info: getInfo() }
        }),
      saveSecrets: authed
        .input(
          type({ connectionId: 'string.uuid', connectionString: 'string > 0' })
        )
        .handler(({ input }) => connections.save(input)),
      unpair: authed.handler(({ context }) =>
        pairings.remove(context.browserId)
      ),
    },
    query: createQueryRouter(authed.errors(queryErrors), {
      connectionString: (input) => connections.resolve(input),
      owner: (context) => context.browserId,
    }),
  }
}

export type BridgeRouter = RouterClient<ReturnType<typeof createRouter>>
