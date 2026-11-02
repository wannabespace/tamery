import type { InferClientOutputs } from '@orpc/client'
import type { BridgeRouter } from '@tamery/cli/src/bridge/router'
import { bridgeKey, MIN_BRIDGE_PROTOCOL } from '@tamery/shared/bridge'
import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'
import { Result } from 'better-result'
import { useSubscription } from 'seitu/react'
import { toast } from 'sonner'

import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import { getBridgeClient, isLoopbackUrl } from './client'
import type { BridgePairing } from './pairing'
import { BRIDGE_QUERY_KEY, bridgePairing, clearBridgePairing } from './pairing'

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

export const toStatus = (info: BridgeInfo): BridgeStatus => {
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

export const forget = (pairing: BridgePairing) => {
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

export const statusQueryOptions = (pairing: BridgePairing | null) =>
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
export const ensureConnected = async (pairing: BridgePairing) => {
  const status = await queryClient.query(statusQueryOptions(pairing))
  if (status.state !== 'connected') {
    throw new BridgeError(status, pairing.name)
  }
}
