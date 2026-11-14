import { log } from '@clack/prompts'
import { os } from '@orpc/server'
import type { RouterClient } from '@orpc/server'
import { createQueryRouter } from '@tamery/query-proxy'
import { BRIDGE_PROTOCOL, bridgeKey } from '@tamery/shared/bridge'
import { challenge } from '@tamery/shared/challenge'
import { type } from 'arktype'
import { Result } from 'better-result'

import { analytics } from '../analytics'
import { api } from '../api'
import { env } from '../env'
import { installer } from '../installer'
import { paint } from '../paint'
import { updates } from '../update-check'
import { approvals } from './approvals'
import { confinement } from './confinement'
import { connections } from './connections'
import { queryErrors } from './errors'
import { hostKeys } from './host-keys'
import { pairings } from './pairings'
import { printable } from './printable'

const base = os.$context<{ authorization: string | null; origin: string }>()

const UNNAMED_BROWSER = 'A browser'

const authed = base
  .errors({
    UNAUTHORIZED: { message: 'This browser is not paired with the bridge.' },
  })
  .use(({ context, errors, next }) => {
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
    installer,
    latestVersion: updates.latest(),
    name,
    protocol: BRIDGE_PROTOCOL,
    version: env.VERSION,
  })

  return {
    bridge: {
      answerHostKey: authed
        .input(type({ id: 'string', trusted: 'boolean' }))
        .handler(async ({ input }) => {
          hostKeys.answer(input.id, input.trusted)
          await analytics.capture('bridge_host_key_answered', {
            trusted: input.trusted,
          })
        }),
      hello: base
        .input(type({ browserId: 'string | null', nonce: 'string.hex == 64' }))
        .handler(({ input }) => {
          const hash = input.browserId && pairings.find(input.browserId)?.hash
          return {
            ...getInfo(),
            proof: hash ? bridgeKey.proof(hash, input.nonce) : null,
          }
        }),
      hostKeys: authed.handler(() => hostKeys.waiting()),
      /**
       * Each side has Tamery vouch for its account before anyone is asked: anything that reaches the port (a local process, a
       * `--public-url` client) can send `userId` and pick `label`, so only `browserNonce` shows the request is the user's.
       */
      pair: base
        .errors({
          DECLINED: {
            message:
              'The bridge did not allow this browser: it was declined, or nobody answered within 2 minutes. Click Connect again and allow it in the terminal running `tamery bridge`, or with `tamery bridge approve`.',
          },
          NOT_ATTESTED: {
            message:
              'The bridge could not confirm its account with Tamery. Check that it is online and signed in, then pair again.',
          },
          OTHER_ACCOUNT: {
            message:
              'This bridge is signed in to another Tamery account. Sign in to that one here, or run `tamery logout` and `tamery bridge` on that computer.',
          },
        })
        .input(
          type({
            browserNonce: 'string.hex == 64',
            label: type('string <= 100').pipe(printable),
            nonce: 'string.hex == 64',
            userId: 'string',
          })
        )
        .handler(async ({ context, errors, input }) => {
          if (input.userId !== userId) {
            throw errors.OTHER_ACCOUNT()
          }
          // Before any call to Tamery, so a flood of requests costs the API nothing once the terminal has enough to answer.
          if (approvals.isFull()) {
            throw errors.DECLINED()
          }
          const isUsersBrowser = await Result.tryPromise(async () => {
            const verified = await api.account.bridge.verify({
              nonce: input.browserNonce,
              origin: context.origin,
            })
            if (verified) {
              await api.account.bridge.attest({
                nonce: input.nonce,
                origin: context.origin,
              })
            }
            return verified
          })
          if (isUsersBrowser.isErr()) {
            throw errors.NOT_ATTESTED({ cause: isUsersBrowser.error.cause })
          }
          if (!isUsersBrowser.value) {
            throw errors.OTHER_ACCOUNT()
          }
          const label = input.label || UNNAMED_BROWSER
          const allowed = await approvals.ask(
            `Allow ${paint.bold(label)} to run queries on this computer, with its files, SSH keys and credentials? Only if Tamery shows ${paint.bold(challenge.getUserCode(input.browserNonce))}.`
          )
          await analytics.capture('bridge_pair_answered', { allowed })
          if (!allowed) {
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
        .handler(async ({ errors, input }) => {
          await connections.save(input, errors)
        }),
      unpair: authed.handler(({ context }) =>
        pairings.remove(context.browserId)
      ),
    },
    query: createQueryRouter(authed.errors(queryErrors), {
      connectionString: async (input, _context, dialect, errors) => {
        const connectionString = await connections.resolve(
          input,
          dialect,
          errors
        )
        const refusal = confinement.getRefusal(connectionString)
        if (refusal) {
          throw errors.BAD_REQUEST({ message: refusal })
        }
        return connectionString
      },
      owner: (context) => context.browserId,
    }),
  }
}

export type BridgeRouter = RouterClient<ReturnType<typeof createRouter>>
