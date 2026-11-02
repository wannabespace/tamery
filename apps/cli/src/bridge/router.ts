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
import { authErrors, pairErrors, queryErrors, saveErrors } from './errors'
import { pairings } from './pairings'
import { printable } from './printable'

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
      /**
       * Each side has Tamery vouch for its account before anyone is asked: anything that reaches the port (a local process, a
       * `--public-url` client) can send `userId` and pick `label`, so only `browserNonce` shows the request is the user's.
       */
      pair: base
        .errors(pairErrors)
        .input(
          type({
            browserNonce: 'string.hex == 64',
            label: type('string <= 100').pipe(printable),
            nonce: 'string.hex == 64',
            userId: 'string',
          })
        )
        .handler(async ({ errors, input }) => {
          if (input.userId !== userId) {
            throw errors.OTHER_ACCOUNT()
          }
          // Before any call to Tamery, so a flood of requests costs the API nothing once the terminal has enough to answer.
          if (approvals.isFull()) {
            throw errors.DECLINED()
          }
          const isUsersBrowser = await Result.tryPromise(() =>
            api.account.bridge.verify({ nonce: input.browserNonce })
          )
          if (isUsersBrowser.isErr()) {
            throw errors.NOT_ATTESTED({ cause: isUsersBrowser.error.cause })
          }
          if (!isUsersBrowser.value) {
            throw errors.OTHER_ACCOUNT()
          }
          const attested = await Result.tryPromise(() =>
            api.account.bridge.attest({ nonce: input.nonce })
          )
          if (attested.isErr()) {
            throw errors.NOT_ATTESTED({ cause: attested.error.cause })
          }
          const label = input.label || 'A browser'
          if (
            !(await approvals.ask(
              `Allow ${paint.bold(label)} to run queries on this computer?`
            ))
          ) {
            log.info(`Did not allow ${paint.bold(label)}.`)
            throw errors.DECLINED()
          }
          log.success(`Allowed ${paint.bold(label)}.`)
          return { ...pairings.add(label), info: getInfo() }
        }),
      saveSecrets: authed
        .errors({
          ACCESS_DECLINED: saveErrors.ACCESS_DECLINED,
          NOT_FOUND: queryErrors.NOT_FOUND,
        })
        .input(
          type({
            connectionId: 'string.uuid.v7',
            connectionString: 'string > 0',
          })
        )
        .handler(async ({ context, errors, input }) => {
          const label = pairings.getLabel(context.browserId) ?? 'A browser'
          const saved = await connections.save(input, (access) =>
            approvals.ask(
              `Allow ${paint.bold(label)} to have this computer use ${access.map((item) => paint.bold(printable(item))).join(', ')}?`
            )
          )
          if (!saved) {
            throw errors.ACCESS_DECLINED()
          }
        }),
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
