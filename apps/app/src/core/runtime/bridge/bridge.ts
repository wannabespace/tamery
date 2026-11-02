import { createORPCClient, ORPCError, safe } from '@orpc/client'
import type { InferClientOutputs } from '@orpc/client'
import type { BridgeRouter } from '@tamery/cli/src/bridge/router'
import {
  bridgeKey,
  bridgeNeedsSecrets,
  MIN_BRIDGE_PROTOCOL,
} from '@tamery/shared/bridge'
import { formatBrowserName } from '@tamery/shared/device-label'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { omit, silently } from '@tamery/shared/utils'
import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { Result } from 'better-result'
import { memoize } from 'memoza'
import { useSubscription } from 'seitu/react'
import { toast } from 'sonner'

import { getCollections } from '~/core/collections'
import { getSessionUser } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import {
  createBridgeLink,
  getBridgeClient,
  isLoopbackUrl,
  parseBridgeUrl,
} from './client'
import type { BridgePairing } from './pairing'
import {
  BRIDGE_QUERY_KEY,
  bridgeAsks,
  bridgePairing,
  clearBridgePairing,
  getActivePairing,
} from './pairing'

const BRIDGE_CHECK_INTERVAL = 10_000

type BridgeInfo = InferClientOutputs<BridgeRouter>['bridge']['pair']['info']

type BridgeTrouble =
  | { info: BridgeInfo; state: 'outdated' }
  | { reason: 'denied' | 'stopped'; state: 'unreachable' }

export type BridgeStatus =
  | { info: BridgeInfo; state: 'connected' }
  | BridgeTrouble

const reported = new Set<'bridge_outdated' | 'bridge_unreachable'>()

const reportOnce = (event: 'bridge_outdated' | 'bridge_unreachable') => {
  if (!reported.has(event)) {
    reported.add(event)
    posthog.capture(event)
  }
}

export const getBridgeStatusMessage = (status: BridgeStatus, name: string) => {
  if (status.state === 'connected') {
    return `Queries from this browser run on ${name}.`
  }
  if (status.state === 'outdated') {
    return `Update the bridge on ${name} to run queries.`
  }
  if (status.reason === 'denied') {
    return `This browser blocks Tamery from reaching ${name}. Allow local network access for this site in the browser’s settings.`
  }
  return `The bridge on ${name} is not running. Start \`tamery bridge\` there.`
}

export class BridgeError extends Error {
  readonly bridgeName: string
  readonly status: BridgeTrouble

  constructor(status: BridgeTrouble, bridgeName: string) {
    super(getBridgeStatusMessage(status, bridgeName))
    this.name = 'BridgeError'
    this.bridgeName = bridgeName
    this.status = status
  }
}

const toStatus = (info: BridgeInfo): BridgeStatus => {
  if (info.protocol >= MIN_BRIDGE_PROTOCOL) {
    return { info, state: 'connected' }
  }
  reportOnce('bridge_outdated')
  return { info, state: 'outdated' }
}

const toUnreachable = async (pairing: BridgePairing): Promise<BridgeStatus> => {
  reportOnce('bridge_unreachable')
  const answers = isLoopbackUrl(pairing.url)
    ? await Promise.allSettled(
        ['loopback-network', 'local-network'].map((name) =>
          // Neither name is a `PermissionName` in the DOM typings yet; a browser that does not know one rejects it.
          navigator.permissions.query({ name: name as PermissionName })
        )
      )
    : []
  const known = answers.find((answer) => answer.status === 'fulfilled')
  const denied = known?.status === 'fulfilled' && known.value.state === 'denied'
  return { reason: denied ? 'denied' : 'stopped', state: 'unreachable' }
}

const forget = (pairing: BridgePairing) => {
  const message = `The bridge on ${pairing.name} no longer knows this browser. Connect again from Settings → Bridge.`
  // A late answer for a pairing this browser already replaced must not clear the new one.
  if (bridgePairing.get()?.secret === pairing.secret) {
    clearBridgePairing()
    toast.error(message, { id: 'bridge-forgotten' })
  }
  return new Error(message)
}

const check = async (pairing: BridgePairing) => {
  const nonce = bridgeKey.nonce()
  const hello = await Result.tryPromise(() =>
    getBridgeClient(pairing.url).bridge.hello({
      browserId: pairing.browserId,
      nonce,
    })
  )
  if (hello.isErr()) {
    return toUnreachable(pairing)
  }
  const { proof, ...info } = hello.value
  if (proof === null) {
    throw forget(pairing)
  }
  // Another process took the port: whatever it is, it is not the bridge this browser paired with.
  if (proof !== bridgeKey.proof(bridgeKey.hash(pairing.secret), nonce)) {
    return toUnreachable(pairing)
  }
  return toStatus(info)
}

const statusQueryOptions = (pairing: BridgePairing | null) =>
  queryOptions({
    queryFn: pairing ? () => check(pairing) : skipToken,
    queryKey: [BRIDGE_QUERY_KEY, pairing?.browserId ?? null],
    refetchInterval: ({ state: { data } }) =>
      data?.state === 'unreachable' && data.reason === 'denied'
        ? false
        : BRIDGE_CHECK_INTERVAL,
    refetchOnWindowFocus: 'always',
    staleTime: 0,
    throwOnError: false,
  })

export const useBridgeStatus = () => {
  const pairing = useSubscription(bridgePairing)
  const { data } = useQuery(
    statusQueryOptions(pairing?.enabled ? pairing : null)
  )
  return pairing && { pairing, status: data ?? null }
}

/**
 * Every call asks `hello` first, never a cached answer: the bridge may have stopped since and another process taken its port,
 * which must not receive the secret. Calls made together share one `hello`.
 */
const ensureConnected = async (pairing: BridgePairing) => {
  const status = await queryClient.query(statusQueryOptions(pairing))
  if (status.state !== 'connected') {
    throw new BridgeError(status, pairing.name)
  }
}

/**
 * A Full string is sent only right after the user saved it here: the bridge runs a file or machine login only as this user
 * saved it, and the synced copy may be another member's edit.
 */
const getCompleteString = (connectionId: string, savedHere: boolean) => {
  const { connectionsCollection, connectionStringsCollection } =
    getCollections()
  const connection = connectionsCollection.get(connectionId)
  const stored = connectionStringsCollection.get(connectionId)
  const complete =
    (savedHere || connection?.syncType !== SyncType.Cloud) &&
    !!stored &&
    stored.missingSecrets.length === 0 &&
    (stored.isPasswordPopulated || !connection?.isPasswordExists)
  return complete
    ? connectionStringsCollection.utils.decrypt(connectionId)
    : null
}

/** An interceptor sees every procedure's error untyped, so the data is checked against the shared schema. */
const getAskedSecrets = (error: ORPCError<string, unknown> | null) => {
  const data =
    error?.code === 'NEEDS_SECRETS' ? bridgeNeedsSecrets(error.data) : null
  return data instanceof type.errors ? null : data
}

const getPairedClient = memoize((pairing: BridgePairing): BridgeRouter =>
  createORPCClient(createBridgeLink(pairing.url, pairing.secret), {
    interceptors: [
      async ({ next }) => {
        await ensureConnected(pairing)
        const call = () => safe(next())
        const first = await call()
        const asked = getAskedSecrets(first.definedError)
        const stored =
          asked && (await getCompleteString(asked.connectionId, false))
        if (asked && stored) {
          await getPairedClient(pairing).bridge.saveSecrets({
            connectionId: asked.connectionId,
            connectionString: stored,
          })
        }
        const { data, definedError, error } = stored ? await call() : first
        if (!error) {
          return data
        }
        if (definedError?.code === 'UNAUTHORIZED') {
          throw forget(pairing)
        }
        const missing = getAskedSecrets(definedError)
        if (missing) {
          bridgeAsks.set((asks) => ({
            ...asks,
            [missing.connectionId]: missing.fields,
          }))
        } else {
          await queryClient.invalidateQueries({
            queryKey: statusQueryOptions(pairing).queryKey,
          })
        }
        // A request that never got an answer: if the bridge went away meanwhile, say so instead of the network error.
        if (!(error instanceof ORPCError)) {
          await ensureConnected(pairing)
        }
        throw error
      },
    ],
  })
)

export const bridge = {
  client: getPairedClient,
  pair: async ({
    browserNonce,
    url,
    via,
  }: {
    browserNonce: string
    url: string
    via: 'link' | 'manual'
  }) => {
    const origin = parseBridgeUrl(url)
    if (!origin) {
      throw new Error(
        'Tamery pairs only with a bridge on this computer or at an https:// address.'
      )
    }
    const user = await getSessionUser()
    if (!user) {
      throw new Error('Sign in to connect a bridge.')
    }
    // The bridge asks Tamery whether this request is the user's own before its terminal asks the user.
    await orpc.account.bridge.attest.call({ nonce: browserNonce })
    const nonce = bridgeKey.nonce()
    const { info, ...paired } = await getBridgeClient(origin).bridge.pair({
      browserNonce,
      label: formatBrowserName(navigator.userAgent),
      nonce,
      userId: user.id,
    })
    // The bridge's own account check proves nothing, since any server can pass it: only Tamery knows whom the bridge signed in as.
    if (!(await orpc.account.bridge.verify.call({ nonce }))) {
      throw new Error('This bridge is not signed in to your Tamery account.')
    }
    const pairing = { ...paired, enabled: true, name: info.name, url: origin }
    clearBridgePairing()
    queryClient.setQueryData(
      statusQueryOptions(pairing).queryKey,
      toStatus(info)
    )
    bridgePairing.set(pairing)
    posthog.capture('bridge_paired', { remote: !isLoopbackUrl(origin), via })
    return pairing
  },
  saveSecrets: async (connectionId: string) => {
    const pairing = getActivePairing()
    const connectionString =
      pairing && (await getCompleteString(connectionId, true))
    if (!(pairing && connectionString)) {
      return
    }
    bridgeAsks.set((asks) => omit(asks, [connectionId]))
    await getPairedClient(pairing).bridge.saveSecrets({
      connectionId,
      connectionString,
    })
    posthog.capture('bridge_secrets_saved')
  },
  unpair: (pairing: BridgePairing) => {
    void silently(() => getPairedClient(pairing).bridge.unpair())
    clearBridgePairing()
    posthog.capture('bridge_unpaired')
  },
}
