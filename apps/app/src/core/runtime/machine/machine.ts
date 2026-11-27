import { createORPCClient, ORPCError, safe } from '@orpc/client'
import type { MachineRouter } from '@tamery/cli/src/machine/router'
import { formatBrowserName } from '@tamery/shared/device-label'
import { SyncType } from '@tamery/shared/enums/sync-type'
import type { MachineId, machineHostKey } from '@tamery/shared/machine'
import { machineIdSchema, machineKey } from '@tamery/shared/machine'
import { omit, silently } from '@tamery/shared/utils'
import { memoize } from 'memoza'

import { getCollections } from '~/core/collections'
import { bearerToken, getSessionUser } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import { createMachineLink, getMachineClient, parseMachineUrl } from './client'
import { machineHostKeys } from './host-keys'
import type { MachinePairing } from './pairing'
import {
  clearMachinePairing,
  getMachineRoute,
  getThisMachineId,
  machineAsks,
  machinePairings,
  thisMachineQuery,
} from './pairing'
import { ensureConnected, forget, statusQueryOptions, toStatus } from './status'

/**
 * A Full string is sent only when the user saved or allowed it here: the machine runs a file or machine login only as this
 * user saved it, and the synced copy may be another member's edit. A row not loaded yet counts as synced.
 */
const getCompleteString = (connectionId: string, savedHere: boolean) => {
  const { connectionsCollection, connectionStringsCollection } =
    getCollections()
  const connection = connectionsCollection.get(connectionId)
  const stored = connectionStringsCollection.get(connectionId)
  const complete =
    (savedHere || (!!connection && connection.syncType !== SyncType.Cloud)) &&
    !!stored &&
    stored.missingSecrets.length === 0 &&
    (stored.isPasswordPopulated || !connection?.isPasswordExists)
  return complete
    ? connectionStringsCollection.utils.decrypt(connectionId)
    : null
}

export class UnconfirmedConnectionError extends Error {
  readonly connectionId: string

  constructor(connectionId: string, message: string) {
    super(message)
    this.name = 'UnconfirmedConnectionError'
    this.connectionId = connectionId
  }
}

const sendStoredSecrets = async (
  client: MachineRouter,
  connectionId: string
) => {
  const connectionString = await getCompleteString(connectionId, false)
  if (connectionString) {
    await client.machine.saveSecrets({ connectionId, connectionString })
  }
  return !!connectionString
}

const trustHostKey = async (
  client: MachineRouter,
  machineId: MachineId,
  hostKey: typeof machineHostKey.infer
) => {
  const trusted = await machineHostKeys.ask(machineId, hostKey)
  if (trusted) {
    await client.machine.trustHostKey(hostKey)
  }
  return trusted
}

const getPairedClient = memoize((pairing: MachinePairing): MachineRouter =>
  createORPCClient<MachineRouter>(
    createMachineLink(pairing.url, pairing.secret),
    {
      interceptors: [
        async ({ next }) => {
          await ensureConnected(pairing)
          const call = () => safe(next())
          const first = await call()
          const asked = first.definedError
          const client = getPairedClient(pairing)
          const answered =
            (asked?.code === 'NEEDS_SECRETS' &&
              (await sendStoredSecrets(client, asked.data.connectionId))) ||
            (asked?.code === 'UNKNOWN_HOST_KEY' &&
              (await trustHostKey(client, pairing.machineId, asked.data)))
          const { data, definedError, error } = answered ? await call() : first
          if (!error) {
            return data
          }
          if (definedError?.code === 'UNAUTHORIZED') {
            throw forget(pairing)
          }
          if (definedError?.code === 'UNCONFIRMED') {
            throw new UnconfirmedConnectionError(
              definedError.data.connectionId,
              definedError.message
            )
          }
          if (definedError?.code === 'NEEDS_SECRETS') {
            const { connectionId, fields } = definedError.data
            machineAsks.set((asks) => ({ ...asks, [connectionId]: fields }))
          } else {
            await queryClient.invalidateQueries({
              queryKey: statusQueryOptions(pairing).queryKey,
            })
          }
          // A request that never got an answer: if the machine went away meanwhile, say so instead of the network error.
          if (!(error instanceof ORPCError)) {
            await ensureConnected(pairing)
          }
          throw error
        },
      ],
    }
  )
)

/** The machine at one of these URLs: a listed machine names every address it listens at, and this browser may reach only some. */
const findMachineUrl = async (urls: string[], machineId: MachineId) => {
  const origins = urls.flatMap((url) => parseMachineUrl(url) ?? [])
  if (origins.length === 0) {
    throw new Error(
      'Tamery pairs only with a machine on this computer or at an https:// address.'
    )
  }
  const answers = await Promise.allSettled(
    origins.map(async (origin) => {
      const info = await getMachineClient(origin).machine.hello({
        browserId: null,
        nonce: machineKey.nonce(),
      })
      return { isOther: info.id !== machineId, origin }
    })
  )
  const reached = answers.find(
    (answer) => answer.status === 'fulfilled' && !answer.value.isOther
  )
  if (reached?.status === 'fulfilled') {
    return reached.value.origin
  }
  // A machine that did not answer says more than another one answering on its loopback port.
  const failed = answers.find((answer) => answer.status === 'rejected')
  if (failed?.status === 'rejected') {
    throw failed.reason
  }
  throw new Error(`Another machine answers at ${origins.join(', ')}.`)
}

const unpair = async (pairing: MachinePairing) => {
  await silently(() => getPairedClient(pairing).machine.unpair())
  clearMachinePairing(pairing)
  posthog.capture('machine_unpaired')
}

const getThisComputerAccount = async () => {
  const [user, token] = [await getSessionUser(), bearerToken.get()]
  return user && !user.isAnonymous && token
    ? { email: user.email, id: user.id, token }
    : null
}

/** Sign-out moves main to a new session, so a request this window sent for the account that left is refused. */
const getThisComputerSession = async () => {
  const status = await queryClient.ensureQueryData(thisMachineQuery)
  return status?.session ?? 0
}

export const machine = {
  client: getPairedClient,
  /** Throws when the machine kept nothing: it restarted since finding the database, or `found` is not on its computer or not the saved string's server. */
  keepFoundPassword: async (input: {
    connectionId: string
    connectionString: string
    found: string
  }) => {
    const pairing = getMachineRoute(input.connectionId)?.pairing
    const kept =
      !!pairing &&
      (await getPairedClient(pairing).localDatabases.keepPassword(input))
    if (!kept) {
      throw new Error(
        "The machine couldn't keep this database's saved password. Enter it in the connection."
      )
    }
    posthog.capture('machine_local_password_kept')
  },
  pair: async ({
    browserNonce,
    machineId,
    urls,
  }: {
    browserNonce: string
    machineId: MachineId
    urls: string[]
  }) => {
    const user = await getSessionUser()
    if (!user) {
      throw new Error('Sign in to connect a machine.')
    }
    const origin = await findMachineUrl(urls, machineId)
    // Both nonces name the URL this browser calls: a machine reached through a relay at another one attests its own.
    await orpc.account.machine.attest.call({ nonce: browserNonce, origin })
    const nonce = machineKey.nonce()
    const { info, ...paired } = await getMachineClient(origin).machine.pair({
      browserNonce,
      label: formatBrowserName(navigator.userAgent),
      nonce,
      userId: user.id,
    })
    // The machine's own account check proves nothing, since any server can pass it: only Tamery knows whom the machine signed in as.
    if (!(await orpc.account.machine.verify.call({ nonce, origin }))) {
      throw new Error(
        'This machine is not signed in to your Tamery account, or answered from another address.'
      )
    }
    const pairing = {
      ...paired,
      machineId: machineIdSchema.assert(info.id),
      name: info.name,
      url: origin,
    }
    const replaced = machinePairings.get()[info.id]
    if (replaced) {
      clearMachinePairing(replaced)
    }
    queryClient.setQueryData(
      statusQueryOptions(pairing).queryKey,
      toStatus(info)
    )
    machinePairings.set((all) => ({ ...all, [info.id]: pairing }))
    // What failed for want of this pairing stays failed for an error boundary until dropped.
    const { connectionMachinesCollection, connectionStringsCollection } =
      getCollections()
    for (const row of connectionMachinesCollection.toArray) {
      if (row.machineId === info.id) {
        connectionStringsCollection.utils.dropQueries(row.connectionId)
      }
    }
    return pairing
  },
  /** `false` when this browser lacks part of the string too, or the connection runs on no machine it is paired with. */
  saveSecrets: async (connectionId: string) => {
    const pairing = getMachineRoute(connectionId)?.pairing
    const connectionString =
      pairing && (await getCompleteString(connectionId, true))
    if (!(pairing && connectionString)) {
      return false
    }
    machineAsks.set((asks) => omit(asks, [connectionId]))
    await getPairedClient(pairing).machine.saveSecrets({
      connectionId,
      connectionString,
    })
    posthog.capture('machine_secrets_saved')
    return true
  },
  /** Revokes the secret on the machine before forgetting it here, so a copy taken from this browser stops working too. */
  unpair,
  unpairAll: () =>
    Promise.all(Object.values(machinePairings.get()).map(unpair)),
  /** On sign-in, unless the user turned it off. A guest has no other device to serve. */
  startThisComputer: async () => {
    const account = await getThisComputerAccount()
    if (window.electron && account) {
      await window.electron.machine.enable({
        account,
        session: await getThisComputerSession(),
      })
    }
  },
  /** Restarts it when it runs; one the user turned off only keeps the address. */
  saveThisComputerAddress: async (publicUrl: string | null) => {
    await window.electron?.machine.setPublicUrl({
      publicUrl,
      session: await getThisComputerSession(),
    })
  },
  turnThisComputerOn: async () => {
    const account = await getThisComputerAccount()
    if (!window.electron || !account) {
      throw new Error('Sign in to use this computer from your other devices.')
    }
    const status = await window.electron.machine.turnOn({
      account,
      session: await getThisComputerSession(),
    })
    if (status.status === 'failed') {
      throw new Error(status.message)
    }
    if (status.status !== 'on') {
      throw new Error('This computer’s machine stopped before it started.')
    }
  },
  turnThisComputerOff: async () => {
    await window.electron?.machine.turnOff()
  },
  /** On sign-out or a guest's upgrade: this desktop's machine leaves the account with it, and forgets the browsers it allowed. */
  forgetThisComputer: async () => {
    const id = getThisMachineId()
    if (id !== null) {
      await silently(() => orpc.machines.remove.call({ id }))
    }
    await window.electron?.machine.forget()
    queryClient.removeQueries({ queryKey: thisMachineQuery.queryKey })
  },
}
