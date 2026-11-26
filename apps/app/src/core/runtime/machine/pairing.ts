import type { machineNeedsSecrets } from '@tamery/shared/machine'
import { omit } from '@tamery/shared/utils'
import { useLiveQuery } from '@tanstack/react-db'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { useEffect } from 'react'
import { createStore } from 'seitu'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'
import { v7 } from 'uuid'

import {
  getCollections,
  mutateOffline,
  useCollections,
} from '~/core/collections'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

import type { ConnectionMachine, Machine } from './sync'

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

/** While starting, the status settles within a second or two. */
const STARTING_POLL_MS = 1000
/** Once on, the process can still die, and main has no way to tell an open window. */
const ON_POLL_MS = 5000

/**
 * Desktop only: main's state of this computer's own machine. Kept for the session, never collected: its id routes a
 * connection on it here, never over HTTP to itself. Never starts the machine: sign-out drops this query while the session
 * still lives, so a mounted observer's refetch would start it again for the account leaving.
 */
export const thisMachineQuery = queryOptions({
  gcTime: Infinity,
  queryFn: async () => (await window.electron?.machine.status()) ?? null,
  queryKey: ['this-machine'],
  refetchInterval: ({ state: { data } }) => {
    if (data?.status === 'starting') {
      return STARTING_POLL_MS
    }
    return data?.status === 'on' ? ON_POLL_MS : false
  },
})

export const getThisMachineId = () =>
  queryClient.getQueryData(thisMachineQuery.queryKey)?.id ?? null

export const useThisMachineId = () =>
  useQuery({ ...thisMachineQuery, enabled: !!window.electron }).data?.id ?? null

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

export const CLOUD = 'cloud'

/**
 * A machine's id, `CLOUD`, or `null` for here: the cloud proxy on the web, where `CLOUD` never appears, and this computer on
 * desktop, which its own machine's id reads as too.
 */
export type RunsOn = string | null

const toRunsOn = (
  row: ConnectionMachine | null,
  ownId: string | null
): RunsOn => {
  if (!row) {
    return null
  }
  if (row.machineId === null) {
    return window.electron ? CLOUD : null
  }
  return row.machineId === ownId ? null : row.machineId
}

const findRow = (connectionId: string) =>
  getCollections().connectionMachinesCollection.toArray.find(
    (row) => row.connectionId === connectionId
  ) ?? null

export const getConnectionRunsOn = (connectionId: string) =>
  toRunsOn(findRow(connectionId), getThisMachineId())

export const getMachineRouteById = (
  runsOn: RunsOn,
  connectionId: string | null = null
): MachineRoute | null =>
  runsOn === null || runsOn === CLOUD
    ? null
    : toRoute({
        asks: (connectionId && machineAsks.get()[connectionId]) || null,
        machine: getCollections().machinesCollection.get(runsOn) ?? null,
        machineId: runsOn,
        pairing: machinePairings.get()[runsOn] ?? null,
      })

export const getMachineRoute = (connectionId: string | null) =>
  connectionId === null
    ? null
    : getMachineRouteById(getConnectionRunsOn(connectionId), connectionId)

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
  runsOn: RunsOn,
  connectionId: string | null = null
): MachineRoute | null => {
  const machines = useMachines()
  const pairing = useSubscription(machinePairings, {
    selector: (all) => (runsOn && all[runsOn]) || null,
  })
  const asks = useSubscription(machineAsks, {
    selector: (all) => (connectionId && all[connectionId]) || null,
  })
  return runsOn === null || runsOn === CLOUD
    ? null
    : toRoute({
        asks,
        machine: machines.find((machine) => machine.id === runsOn) ?? null,
        machineId: runsOn,
        pairing,
      })
}

export const useConnectionRunsOn = (connectionId: string | null) => {
  const { connectionMachinesCollection } = useCollections()
  const { data = [] } = useLiveQuery((q) =>
    q.from({ row: connectionMachinesCollection })
  )
  return toRunsOn(
    data.find((row) => row.connectionId === connectionId) ?? null,
    useThisMachineId()
  )
}

export const useMachineRoute = (connectionId: string | null) =>
  useMachineRouteById(useConnectionRunsOn(connectionId), connectionId)

/** Query keys name the connection, not the computer, so a connection that moves must not keep what the previous one answered. */
export const useDropQueriesOnMachineChange = () => {
  const { connectionMachinesCollection, connectionStringsCollection } =
    useCollections()
  useEffect(() => {
    const subscription = connectionMachinesCollection.subscribeChanges(
      (changes) => {
        for (const change of changes) {
          if (change.previousValue?.machineId !== change.value.machineId) {
            connectionStringsCollection.utils.dropQueries(
              change.value.connectionId
            )
          }
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [connectionMachinesCollection, connectionStringsCollection])
}

/** Drops this browser's pairing with one machine and every `['machine', browserId]` query it made. */
export const clearMachinePairing = (pairing: MachinePairing) => {
  machinePairings.set((all) => omit(all, [pairing.machineId]))
  queryClient.removeQueries({
    queryKey: [MACHINE_QUERY_KEY, pairing.browserId],
  })
}

/** Its own `mutateOffline`, after the connection's: the server checks the connection exists, and a refusal must not undo it. */
export const writeRunsOn = (connectionId: string, runsOn: RunsOn) => {
  // As this app reads it: a save on the web must not drop the desktop's `CLOUD`, nor one on desktop its own machine's row.
  if (getConnectionRunsOn(connectionId) === runsOn) {
    return
  }
  const { connectionMachinesCollection } = getCollections()
  const row = findRow(connectionId)
  const machineId = runsOn === CLOUD ? null : runsOn
  const now = new Date()
  mutateOffline(() => {
    if (runsOn === null) {
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
  })
  posthog.capture('connection_machine_set', {
    on_cloud: runsOn === CLOUD,
    on_machine: machineId !== null,
  })
}
