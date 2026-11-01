import { type } from 'arktype'
import { createStore } from 'seitu'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'

import { queryClient } from '~/lib/query-client'

export const BRIDGE_QUERY_KEY = 'bridge'

const pairingSchema = type({
  browserId: 'string',
  name: 'string',
  secret: 'string',
  url: 'string',
})

export type BridgePairing = typeof pairingSchema.infer

/** One bridge per browser. Only Settings → Bridge writes it, which the desktop app does not have. */
export const bridgePairing = createWebStorageValue({
  defaultValue: null,
  key: 'bridge-pairing',
  schema: pairingSchema.or('null'),
  type: 'localStorage',
})

/** Per connection, what the bridge last answered `NEEDS_SECRETS` with while this browser lacked it too. */
export const bridgeAsks = createStore<Record<string, string[] | 'all'>>({})

/** What `fetchingConfig` needs to know of the bridge a connection runs on. */
export interface BridgeRoute {
  asks: string[] | 'all' | null
  name: string
}

export const getBridgeRoute = (
  connectionId: string | null
): BridgeRoute | null => {
  const pairing = bridgePairing.get()
  return (
    pairing && {
      asks: (connectionId && bridgeAsks.get()[connectionId]) || null,
      name: pairing.name,
    }
  )
}

export const useBridgeRoute = (
  connectionId: string | null
): BridgeRoute | null => {
  const pairing = useSubscription(bridgePairing)
  const asks = useSubscription(bridgeAsks, {
    selector: (all) => (connectionId && all[connectionId]) || null,
  })
  return pairing && { asks, name: pairing.name }
}

export const clearBridgePairing = () => {
  bridgePairing.set(null)
  bridgeAsks.set({})
  queryClient.removeQueries({ queryKey: [BRIDGE_QUERY_KEY] })
}
