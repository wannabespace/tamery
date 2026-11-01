import { createORPCClient, safe } from '@orpc/client'
import type { InferClientOutputs, ORPCError } from '@orpc/client'
import type { BridgeRouter } from '@tamery/cli/src/bridge/router'
import {
  bridgeKey,
  bridgeNeedsSecrets,
  MIN_BRIDGE_PROTOCOL,
} from '@tamery/shared/bridge'
import { formatDeviceLabel } from '@tamery/shared/device-label'
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
} from './pairing'

const BRIDGE_CHECK_INTERVAL = 30_000

type BridgeInfo = InferClientOutputs<BridgeRouter>['bridge']['pair']['info']

export type BridgeStatus =
  | { info: BridgeInfo; state: 'connected' | 'outdated' }
  | { reason: 'denied' | 'stopped'; state: 'unreachable' }

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
  if (status.state === 'unreachable' && status.reason === 'denied') {
    return `This browser blocks Tamery from reaching ${name}. Allow local network access for this site in the browser’s settings.`
  }
  return `The bridge on ${name} is not running. Start \`tamery bridge\` there.`
}

const toStatus = (info: BridgeInfo): BridgeStatus => {
  if (info.protocol >= MIN_BRIDGE_PROTOCOL) {
    return { info, state: 'connected' }
  }
  reportOnce('bridge_outdated')
  return { info, state: 'outdated' }
}

const getLocalNetworkPermission = async () => {
  const answers = await Promise.allSettled(
    ['loopback-network', 'local-network'].map((name) =>
      // Neither name is a `PermissionName` in the DOM typings yet; a browser that does not know one rejects it.
      navigator.permissions.query({ name: name as PermissionName })
    )
  )
  const known = answers.find((answer) => answer.status === 'fulfilled')
  return known?.status === 'fulfilled' ? known.value.state : null
}

const toUnreachable = async (pairing: BridgePairing): Promise<BridgeStatus> => {
  reportOnce('bridge_unreachable')
  const denied =
    isLoopbackUrl(pairing.url) &&
    (await getLocalNetworkPermission()) === 'denied'
  return { reason: denied ? 'denied' : 'stopped', state: 'unreachable' }
}

/** The bridge no longer holds this browser's pairing (`tamery bridge unpair-all`, `tamery logout`). */
const forget = (pairing: BridgePairing) => {
  const message = `The bridge on ${pairing.name} no longer knows this browser. Pair again from Settings → Bridge.`
  // A late answer for a pairing this browser already replaced must not clear the new one.
  if (bridgePairing.get()?.secret === pairing.secret) {
    clearBridgePairing()
    toast.error(message, { id: 'bridge-forgotten' })
  }
  return new Error(message)
}

/** The bridge proves it holds this browser's secret before the secret, or any saved secret, is sent to it. */
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
    retry: 0,
    staleTime: 0,
    throwOnError: false,
  })

export const useBridgeStatus = () => {
  const pairing = useSubscription(bridgePairing)
  const { data } = useQuery(statusQueryOptions(pairing))
  return pairing && { pairing, status: data ?? null }
}

/** A call after a failed one asks `hello` again first: the process answering may not be the bridge that was paired. */
const ensureConnected = async (pairing: BridgePairing) => {
  const options = statusQueryOptions(pairing)
  const cached = queryClient.getQueryState(options.queryKey)
  const status =
    cached?.data?.state === 'connected' && !cached.isInvalidated
      ? cached.data
      : await queryClient.query(options)
  if (status.state !== 'connected') {
    throw new Error(getBridgeStatusMessage(status, pairing.name))
  }
}

/** This browser's string, when it holds every part the bridge may lack; Full connections reach it from the server. */
const getCompleteString = (connectionId: string) => {
  const { connectionsCollection, connectionStringsCollection } =
    getCollections()
  const connection = connectionsCollection.get(connectionId)
  const stored = connectionStringsCollection.get(connectionId)
  const complete =
    connection?.syncType !== SyncType.Cloud &&
    !!stored &&
    stored.missingSecrets.length === 0 &&
    (stored.isPasswordPopulated || !connection?.isPasswordExists)
  return complete
    ? connectionStringsCollection.utils.decrypt(connectionId)
    : null
}

/** A link interceptor sees every procedure's error untyped, so the data is checked against the shared schema. */
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
        const stored = asked && (await getCompleteString(asked.connectionId))
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
          void queryClient.invalidateQueries({
            queryKey: statusQueryOptions(pairing).queryKey,
          })
        }
        throw error
      },
    ],
  })
)

export const bridge = {
  client: getPairedClient,
  pair: async ({
    code,
    url,
    via,
  }: {
    code: string
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
      throw new Error('Sign in to pair a bridge.')
    }
    const { info, ...paired } = await getBridgeClient(origin).bridge.pair({
      code: code.trim(),
      label: formatDeviceLabel(navigator.userAgent),
      userId: user.id,
    })
    const pairing = { ...paired, name: info.name, url: origin }
    clearBridgePairing()
    queryClient.setQueryData(
      statusQueryOptions(pairing).queryKey,
      toStatus(info)
    )
    bridgePairing.set(pairing)
    posthog.capture('bridge_paired', { remote: !isLoopbackUrl(origin), via })
    return pairing
  },
  /** After every save on this device. The bridge merges what it is sent into the copy it keeps. */
  saveSecrets: async (connectionId: string) => {
    const pairing = bridgePairing.get()
    const connectionString = pairing && (await getCompleteString(connectionId))
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
    // An unreachable bridge keeps this browser until `tamery bridge unpair-all`; the browser forgets it either way.
    void silently(() => getPairedClient(pairing).bridge.unpair())
    clearBridgePairing()
    posthog.capture('bridge_unpaired')
  },
}
