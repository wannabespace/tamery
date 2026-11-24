import { log } from '@clack/prompts'
import { os } from '@orpc/server'
import type { RouterClient } from '@orpc/server'
import { forwarding } from '@tamery/connection/forwarding'
import { connectionSecrets } from '@tamery/connection/secrets'
import { createQueryRouter } from '@tamery/query-proxy'
import { challenge } from '@tamery/shared/challenge'
import { localSkills } from '@tamery/shared/local-skills'
import {
  MACHINE_PROTOCOL,
  machineHostKey,
  machineKey,
} from '@tamery/shared/machine'
import { SafeURL } from '@tamery/shared/safe-url'
import { type } from 'arktype'
import { Result } from 'better-result'

import { analytics } from '../analytics'
import { api } from '../api'
import { env } from '../env'
import { installer } from '../installer'
import { paint } from '../paint'
import { updates } from '../update-check'
import { confinement } from './confinement'
import { connections } from './connections'
import { queryErrors } from './errors'
import { hostKeys } from './host-keys'
import { pairings } from './pairings'
import { printable } from './printable'

const base = os.$context<{ authorization: string | null; origin: string }>()

const UNNAMED_BROWSER = 'A browser'

/** Asks the person at the machine whether a browser may pair: the terminal for `tamery machine`, a dialog on desktop. */
export interface Approver {
  ask: (request: { code: string; label: string }) => Promise<boolean>
  isFull: () => boolean
}

const loadLocalDatabases = () =>
  import('@tamery/connection/local-databases/find')

const authed = base
  .errors({
    UNAUTHORIZED: { message: 'This browser is not paired with the machine.' },
  })
  .use(({ context, errors, next }) => {
    const browserId = pairings.authenticate(context.authorization)
    if (!browserId) {
      throw errors.UNAUTHORIZED()
    }
    return next({ context: { browserId } })
  })

export const createRouter = ({
  approver,
  id,
  name,
  userId,
}: {
  approver: Approver
  id: string
  name: string
  userId: string
}) => {
  const getInfo = () => ({
    id,
    installer,
    latestVersion: updates.latest(),
    name,
    protocol: MACHINE_PROTOCOL,
    version: env.VERSION,
  })

  return {
    machine: {
      hello: base
        .input(type({ browserId: 'string | null', nonce: 'string.hex == 64' }))
        .handler(({ input }) => {
          const hash = input.browserId && pairings.find(input.browserId)?.hash
          return {
            ...getInfo(),
            proof: hash ? machineKey.proof(hash, input.nonce) : null,
          }
        }),
      /**
       * Each side has Tamery vouch for its account before anyone is asked: anything that reaches the port (a local process, a
       * `--public-url` client) can send `userId` and pick `label`, so only `browserNonce` shows the request is the user's.
       */
      pair: base
        .errors({
          DECLINED: {
            message:
              'The machine did not allow this browser: it was declined, or nobody answered within 2 minutes. Click Connect again and allow it on that computer.',
          },
          NOT_ATTESTED: {
            message:
              'The machine could not confirm its account with Tamery. Check that it is online and signed in, then pair again.',
          },
          OTHER_ACCOUNT: {
            message:
              'This machine is signed in to another Tamery account. Sign in to that one here, or run `tamery logout` and `tamery machine` on that computer.',
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
          if (approver.isFull()) {
            throw errors.DECLINED()
          }
          const isUsersBrowser = await Result.tryPromise(async () => {
            const verified = await api.account.machine.verify({
              nonce: input.browserNonce,
              origin: context.origin,
            })
            if (verified) {
              await api.account.machine.attest({
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
          const allowed = await approver.ask({
            code: challenge.getUserCode(input.browserNonce),
            label,
          })
          await analytics.capture('machine_pair_answered', { allowed })
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
          await connections.save(input, () => Promise.resolve(true), errors)
        }),
      trustHostKey: authed
        .input(machineHostKey)
        .handler(({ input }) => hostKeys.trust(input)),
      unpair: authed.handler(({ context }) =>
        pairings.remove(context.browserId)
      ),
    },
    localDatabases: {
      find: authed.handler(async () => {
        const { localDatabases } = await loadLocalDatabases()
        const found = await localDatabases.find()
        return found.map((database) => ({
          ...database,
          hasPassword:
            database.hasPassword &&
            confinement.allowsFoundPassword(database.connectionString),
        }))
      }),
      // Never return the password: a found one is another app's secret the browser never had, kept here as the connection's local copy.
      keepPassword: authed
        .errors({ NOT_FOUND: queryErrors.NOT_FOUND })
        .input(
          type({
            connectionId: 'string.uuid.v7',
            connectionString: 'string > 0',
            found: 'string > 0',
          })
        )
        .handler(async ({ errors, input }) => {
          const { localDatabases } = await loadLocalDatabases()
          const { password } = await localDatabases.unlock(input.found)
          if (
            !password ||
            !confinement.allowsFoundPassword(input.found) ||
            !connectionSecrets.isSameServer(input.found, input.connectionString)
          ) {
            return false
          }
          const kept = new SafeURL(input.connectionString)
          kept.password = encodeURIComponent(password)
          return connections.save(
            {
              connectionId: input.connectionId,
              connectionString: kept.toString(),
            },
            () => Promise.resolve(true),
            errors
          )
        }),
    },
    localSkills: {
      list: authed.handler(() => localSkills.list()),
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
        // Opened here, before the driver, so an unknown host key reaches the browser as its own error.
        await forwarding.of(connectionString).catch((error: unknown) => {
          const hostKey = hostKeys.getRefused(connectionString, error)
          throw hostKey ? errors.UNKNOWN_HOST_KEY({ data: hostKey }) : error
        })
        return connectionString
      },
      owner: (context) => context.browserId,
    }),
  }
}

export type MachineRouter = RouterClient<ReturnType<typeof createRouter>>
