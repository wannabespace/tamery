import { describeConnectionString } from '@tamery/connection/utils'
import type { Dialect } from '@tamery/shared/enums/connection-type'

import { getCollections } from '~/core/collections'
import { fetchingConfig } from '~/core/connection/fetching-config'
import type { QueryLogEntry } from '~/core/runtime/log'
import { machine } from '~/core/runtime/machine/machine'
import { getMachineRoute } from '~/core/runtime/machine/pairing'
import { orpcProxy } from '~/lib/orpc'

export interface DialectOptions {
  connectionString: string
  connectionId?: string
  resourceId?: string
  resultSets?: { maxRows: number }
  signal?: AbortSignal
  /** Runs every query in this open transaction or session instead of the pool. */
  txId?: string
  log?: (entry: QueryLogEntry) => void
}

const getCloudProxyInput = (options: DialectOptions) => {
  if (options.resourceId) {
    return { resourceId: options.resourceId }
  }
  if (options.connectionId) {
    return { connectionId: options.connectionId }
  }
  return { connectionString: options.connectionString }
}

const getTransport = (dialect: Dialect, options: DialectOptions) => {
  const { connectionsCollection, connectionsResourcesCollection } =
    getCollections()
  const resource = options.resourceId
    ? connectionsResourcesCollection.get(options.resourceId)
    : null
  const connectionId = options.connectionId || resource?.connectionId
  const connection = connectionId
    ? (connectionsCollection.get(connectionId) ?? null)
    : null
  const machineRoute = getMachineRoute(connectionId ?? null)
  const config = fetchingConfig(connection, {
    machine: machineRoute,
    connectionString: describeConnectionString(options.connectionString),
    draft: !connectionId,
  })

  if (!config.canSend) {
    throw new Error(config.reason ?? 'This connection is still loading.')
  }

  if (machineRoute && connectionId) {
    return {
      input: { connectionId, resourceName: resource?.name ?? null },
      kind: 'proxy' as const,
      proxy: machine.client(machineRoute.pairing).query[dialect],
    }
  }

  const electron = window.electron?.query[dialect]
  if (electron) {
    return { electron, kind: 'electron' as const }
  }

  return {
    input: getCloudProxyInput(options),
    kind: 'proxy' as const,
    proxy: orpcProxy.query[dialect],
  }
}

type Transport = ReturnType<typeof getTransport>

const pinnedTransports = new Map<string, Transport>()

export const createTransport = (dialect: Dialect, options: DialectOptions) => ({
  current: () => getTransport(dialect, options),
  open: async (open: (transport: Transport) => Promise<{ txId: string }>) => {
    const transport = getTransport(dialect, options)
    const opened = await open(transport)
    pinnedTransports.set(opened.txId, transport)
    return opened
  },
  pinned: (txId: string) =>
    pinnedTransports.get(txId) ?? getTransport(dialect, options),
  release: (txId: string) => pinnedTransports.delete(txId),
})
