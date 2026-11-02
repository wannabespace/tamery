import { createORPCClient, ORPCError, safe } from '@orpc/client'
import type { BridgeRouter } from '@tamery/cli/src/bridge/router'
import { bridgeKey } from '@tamery/shared/bridge'
import { formatBrowserName } from '@tamery/shared/device-label'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { omit, silently } from '@tamery/shared/utils'
import { memoize } from 'memoza'

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
  bridgeAsks,
  bridgePairing,
  clearBridgePairing,
  getActivePairing,
} from './pairing'
import { ensureConnected, forget, statusQueryOptions, toStatus } from './status'

/**
 * A Full string is sent only when the user saved or allowed it here: the bridge runs a file or machine login only as this
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

/** A synced connection whose local access (a file, SSH keys, a machine login) nobody allowed on the bridge yet. */
export class UnconfirmedConnectionError extends Error {
  readonly connectionId: string

  constructor(connectionId: string, message: string) {
    super(message)
    this.name = 'UnconfirmedConnectionError'
    this.connectionId = connectionId
  }
}

const getPairedClient = memoize((pairing: BridgePairing): BridgeRouter =>
  createORPCClient<BridgeRouter>(
    createBridgeLink(pairing.url, pairing.secret),
    {
      interceptors: [
        async ({ next }) => {
          await ensureConnected(pairing)
          const call = () => safe(next())
          const first = await call()
          const asked =
            first.definedError?.code === 'NEEDS_SECRETS'
              ? first.definedError.data
              : null
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
          if (definedError?.code === 'UNCONFIRMED') {
            throw new UnconfirmedConnectionError(
              definedError.data.connectionId,
              definedError.message
            )
          }
          if (definedError?.code === 'NEEDS_SECRETS') {
            const { connectionId, fields } = definedError.data
            bridgeAsks.set((asks) => ({ ...asks, [connectionId]: fields }))
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
    }
  )
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
    // Both nonces name the URL this browser calls: a bridge reached through a relay at another one attests its own.
    await orpc.account.bridge.attest.call({ nonce: browserNonce, origin })
    const nonce = bridgeKey.nonce()
    const { info, ...paired } = await getBridgeClient(origin).bridge.pair({
      browserNonce,
      label: formatBrowserName(navigator.userAgent),
      nonce,
      userId: user.id,
    })
    // The bridge's own account check proves nothing, since any server can pass it: only Tamery knows whom the bridge signed in as.
    if (!(await orpc.account.bridge.verify.call({ nonce, origin }))) {
      throw new Error(
        'This bridge is not signed in to your Tamery account, or answered from another address.'
      )
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
  /** `false` when this browser lacks part of the string too. */
  saveSecrets: async (connectionId: string) => {
    const pairing = getActivePairing()
    const connectionString =
      pairing && (await getCompleteString(connectionId, true))
    if (!(pairing && connectionString)) {
      return false
    }
    bridgeAsks.set((asks) => omit(asks, [connectionId]))
    await getPairedClient(pairing).bridge.saveSecrets({
      connectionId,
      connectionString,
    })
    posthog.capture('bridge_secrets_saved')
    return true
  },
  /** Revokes the secret on the bridge before forgetting it here, so a copy taken from this browser stops working too. */
  unpair: async () => {
    const pairing = bridgePairing.get()
    if (!pairing) {
      return
    }
    await silently(() => getPairedClient(pairing).bridge.unpair())
    clearBridgePairing()
    posthog.capture('bridge_unpaired')
  },
}
