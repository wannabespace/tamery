import type { machineNeedsSecrets } from '@tamery/shared/machine'
import { type } from 'arktype'
import { createStore } from 'seitu'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'

import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

export const MACHINE_QUERY_KEY = 'machine'

const pairingSchema = type({
  browserId: 'string',
  enabled: 'boolean = true',
  name: 'string',
  secret: 'string',
  url: 'string',
})

export type MachinePairing = typeof pairingSchema.infer

export const machinePairing = createWebStorageValue({
  defaultValue: null,
  key: 'machine-pairing',
  schema: pairingSchema.or('null'),
  type: 'localStorage',
})

const getActive = (pairing: MachinePairing | null) =>
  pairing?.enabled ? pairing : null

export const getActivePairing = () => getActive(machinePairing.get())

export const useActivePairing = () =>
  useSubscription(machinePairing, { selector: getActive })

export const setMachineEnabled = (enabled: boolean) => {
  machinePairing.set((pairing) => pairing && { ...pairing, enabled })
  posthog.capture('machine_toggled', { enabled })
}

/** Per connection, what the machine last answered `NEEDS_SECRETS` with while this browser lacked it too. */
export const machineAsks = createStore<
  Record<string, (typeof machineNeedsSecrets.infer)['fields']>
>({})

export const getMachineRoute = (connectionId: string | null) => {
  const pairing = getActivePairing()
  return (
    pairing && {
      asks: (connectionId && machineAsks.get()[connectionId]) || null,
      name: pairing.name,
      pairing,
    }
  )
}

export type MachineRoute = NonNullable<ReturnType<typeof getMachineRoute>>

export const useMachineRoute = (connectionId: string | null) => {
  const pairing = useSubscription(machinePairing, { selector: getActive })
  const asks = useSubscription(machineAsks, {
    selector: (all) => (connectionId && all[connectionId]) || null,
  })
  return pairing && { asks, name: pairing.name, pairing }
}

export const clearMachinePairing = () => {
  machinePairing.set(null)
  machineAsks.set({})
  queryClient.removeQueries({ queryKey: [MACHINE_QUERY_KEY] })
}
