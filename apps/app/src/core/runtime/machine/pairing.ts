import type { machineNeedsSecrets } from '@tamery/shared/machine'
import { omit } from '@tamery/shared/utils'
import { useLiveQuery } from '@tanstack/react-db'
import { type } from 'arktype'
import { createStore } from 'seitu'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'
import { v7 } from 'uuid'

import { getCollections, useCollections } from '~/core/collections'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import type { Machine } from './sync'

export const MACHINE_QUERY_KEY = 'machine'

const pairingSchema = type({
  browserId: 'string',
  machineId: 'string',
  name: 'string',
  secret: 'string',
  url: 'string',
})

export type MachinePairing = typeof pairingSchema.infer

/** One per machine this browser was allowed on, keyed by its id. */
export const machinePairings = createWebStorageValue({
  defaultValue: {},
  key: 'machine-pairings',
  schema: type({ '[string]': pairingSchema }),
  type: 'localStorage',
})

/** Per connection, what its machine last answered `NEEDS_SECRETS` with while this browser lacked it too. */
export const machineAsks = createStore<
  Record<string, (typeof machineNeedsSecrets.infer)['fields']>
>({})

const toRoute = ({
  asks,
  machine,
  machineId,
  pairing,
}: {
  asks: MachineRoute['asks']
  machine: Machine | null
  machineId: string
  pairing: MachinePairing | null
}) => ({
  asks,
  machineId,
  name: machine?.name ?? pairing?.name ?? 'another machine',
  pairing,
})

export interface MachineRoute {
  asks: (typeof machineNeedsSecrets.infer)['fields'] | null
  machineId: string
  name: string
  /** `null` until this browser is allowed on the machine. */
  pairing: MachinePairing | null
}

export const getConnectionMachineId = (connectionId: string) =>
  getCollections().connectionMachinesCollection.toArray.find(
    (row) => row.connectionId === connectionId
  )?.machineId ?? null

export const getMachineRouteById = (
  machineId: string | null,
  connectionId: string | null = null
): MachineRoute | null =>
  machineId === null
    ? null
    : toRoute({
        asks: (connectionId && machineAsks.get()[connectionId]) || null,
        machine: getCollections().machinesCollection.get(machineId) ?? null,
        machineId,
        pairing: machinePairings.get()[machineId] ?? null,
      })

export const getMachineRoute = (connectionId: string | null) =>
  connectionId === null
    ? null
    : getMachineRouteById(getConnectionMachineId(connectionId), connectionId)

export const useMachines = () => {
  const { machinesCollection } = useCollections()
  const { data = [] } = useLiveQuery((q) =>
    q
      .from({ machine: machinesCollection })
      .orderBy(({ machine }) => machine.createdAt)
  )
  return data
}

export const useMachineRouteById = (
  machineId: string | null,
  connectionId: string | null = null
): MachineRoute | null => {
  const machines = useMachines()
  const pairing = useSubscription(machinePairings, {
    selector: (all) => (machineId && all[machineId]) || null,
  })
  const asks = useSubscription(machineAsks, {
    selector: (all) => (connectionId && all[connectionId]) || null,
  })
  return machineId === null
    ? null
    : toRoute({
        asks,
        machine: machines.find((machine) => machine.id === machineId) ?? null,
        machineId,
        pairing,
      })
}

export const useConnectionMachineId = (connectionId: string | null) => {
  const { connectionMachinesCollection } = useCollections()
  const { data = [] } = useLiveQuery((q) =>
    q.from({ row: connectionMachinesCollection })
  )
  return (
    data.find((row) => row.connectionId === connectionId)?.machineId ?? null
  )
}

export const useMachineRoute = (connectionId: string | null) =>
  useMachineRouteById(useConnectionMachineId(connectionId), connectionId)

/** Drops this browser's pairing with one machine and every `['machine', browserId]` query it made. */
export const clearMachinePairing = (pairing: MachinePairing) => {
  machinePairings.set((all) => omit(all, [pairing.machineId]))
  queryClient.removeQueries({
    queryKey: [MACHINE_QUERY_KEY, pairing.browserId],
  })
}

/** Inside `mutateOffline`, after the connection's own row: the server checks the connection exists. */
export const writeConnectionMachine = (
  connectionId: string,
  machineId: string | null
) => {
  const { connectionMachinesCollection } = getCollections()
  const row = connectionMachinesCollection.toArray.find(
    (item) => item.connectionId === connectionId
  )
  if ((row?.machineId ?? null) === machineId) {
    return
  }
  const now = new Date()
  if (machineId === null) {
    if (row) {
      connectionMachinesCollection.delete(row.id)
    }
  } else if (row) {
    connectionMachinesCollection.update(row.id, (draft) => {
      draft.machineId = machineId
      draft.updatedAt = now
    })
  } else {
    connectionMachinesCollection.insert({
      connectionId,
      createdAt: now,
      id: v7(),
      machineId,
      updatedAt: now,
    })
  }
  posthog.capture('connection_machine_set', { on_machine: machineId !== null })
}
