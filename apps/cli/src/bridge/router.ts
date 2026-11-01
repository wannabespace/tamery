import { log } from '@clack/prompts'
import { os } from '@orpc/server'
import type { RouterClient } from '@orpc/server'
import { createQueryRouter } from '@tamery/query-proxy'
import { BRIDGE_PROTOCOL, bridgeKey } from '@tamery/shared/bridge'
import { type } from 'arktype'
import { Result } from 'better-result'

import { api } from '../api'
import { env } from '../env'
import { paint } from '../paint'
import { updates } from '../update-check'
import { approvals } from './approvals'
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
      /** Checks the account and has Tamery attest it before anyone is asked, so a refused request never reaches the terminal. */
      pair: base
        .errors(pairErrors)
        .input(
          type({
            label: 'string',
            nonce: 'string.hex == 64',
            userId: 'string',
          })
        )
        .handler(async ({ errors, input }) => {
          if (input.userId !== userId) {
            throw errors.OTHER_ACCOUNT()
          }
          const attested = await Result.tryPromise(() =>
            api.account.bridge.attest({ nonce: input.nonce })
          )
          if (attested.isErr()) {
            throw errors.NOT_ATTESTED({ cause: attested.error.cause })
          }
          const label = input.label || 'A browser'
          if (!(await approvals.ask(label))) {
            log.info(`Did not allow ${paint.bold(label)}.`)
            throw errors.DECLINED()
          }
          log.success(`Allowed ${paint.bold(label)}.`)
          return { ...pairings.add(label), info: getInfo() }
        }),
      saveSecrets: authed
        .errors({ NOT_FOUND: queryErrors.NOT_FOUND })
        .input(
          type({
            connectionId: 'string.uuid.v7',
            connectionString: 'string > 0',
          })
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
