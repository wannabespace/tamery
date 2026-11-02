import { type } from 'arktype'
import { createStore } from 'seitu'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'

import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

export const BRIDGE_QUERY_KEY = 'bridge'

const pairingSchema = type({
  browserId: 'string',
  enabled: 'boolean = true',
  name: 'string',
  secret: 'string',
  url: 'string',
})

export type BridgePairing = typeof pairingSchema.infer

export const bridgePairing = createWebStorageValue({
  defaultValue: null,
  key: 'bridge-pairing',
  schema: pairingSchema.or('null'),
  type: 'localStorage',
})

const getActive = (pairing: BridgePairing | null) =>
  pairing?.enabled ? pairing : null

export const getActivePairing = () => getActive(bridgePairing.get())

export const useActivePairing = () =>
  useSubscription(bridgePairing, { selector: getActive })

export const setBridgeEnabled = (enabled: boolean) => {
  bridgePairing.set((pairing) => pairing && { ...pairing, enabled })
  posthog.capture('bridge_toggled', { enabled })
}

/** Per connection, what the bridge last answered `NEEDS_SECRETS` with while this browser lacked it too. */
export const bridgeAsks = createStore<Record<string, string[] | 'all'>>({})

export const getBridgeRoute = (connectionId: string | null) => {
  const pairing = getActivePairing()
  return (
    pairing && {
      asks: (connectionId && bridgeAsks.get()[connectionId]) || null,
      name: pairing.name,
    }
  )
}

export type BridgeRoute = NonNullable<ReturnType<typeof getBridgeRoute>>

export const useBridgeRoute = (connectionId: string | null) => {
  const pairing = useActivePairing()
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
