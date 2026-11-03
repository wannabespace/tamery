import { describeConnectionString } from '@tamery/connection/utils'
import type { Dialect } from '@tamery/shared/enums/connection-type'

import { getCollections } from '~/core/collections'
import { fetchingConfig } from '~/core/connection/fetching-config'
import { bridge } from '~/core/runtime/bridge/bridge'
import type { BridgePairing } from '~/core/runtime/bridge/pairing'
import { getBridgeRoute } from '~/core/runtime/bridge/pairing'
import type { QueryLogEntry } from '~/core/runtime/log'
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

type Route =
  | {
      connectionId: string
      pairing: BridgePairing
      resourceName: string | null
      via: 'bridge'
    }
  | { via: 'cloud' | 'electron' }

const pinnedRoutes = new Map<string, Route>()

const getCloudProxyInput = (options: DialectOptions) => {
  if (options.resourceId) {
    return { resourceId: options.resourceId }
  }
  if (options.connectionId) {
    return { connectionId: options.connectionId }
  }
  return { connectionString: options.connectionString }
}

export const createTransport = (dialect: Dialect, options: DialectOptions) => {
  const resolveRoute = (): Route => {
    const { connectionsCollection, connectionsResourcesCollection } =
      getCollections()
    const resource = options.resourceId
      ? connectionsResourcesCollection.get(options.resourceId)
      : null
    const connectionId = options.connectionId || resource?.connectionId
    const connection = connectionId
      ? (connectionsCollection.get(connectionId) ?? null)
      : null
    const bridgeRoute = getBridgeRoute(connectionId ?? null)
    const config = fetchingConfig(connection, {
      bridge: bridgeRoute,
      connectionString: describeConnectionString(options.connectionString),
      draft: !connectionId,
    })

    if (!config.canSend) {
      throw new Error(config.reason ?? 'This connection is still loading.')
    }

    if (bridgeRoute && connectionId) {
      return {
        connectionId,
        pairing: bridgeRoute.pairing,
        resourceName: resource?.name ?? null,
        via: 'bridge',
      }
    }
    return { via: window.electron ? 'electron' : 'cloud' }
  }

  const toTransport = (route: Route) => {
    const electron = window.electron?.query[dialect]
    if (route.via === 'electron' && electron) {
      return { electron, kind: 'electron' as const }
    }

    if (route.via === 'bridge') {
      return {
        input: {
          connectionId: route.connectionId,
          resourceName: route.resourceName,
        },
        kind: 'proxy' as const,
        proxy: bridge.client(route.pairing).query[dialect],
      }
    }

    return {
      input: getCloudProxyInput(options),
      kind: 'proxy' as const,
      proxy: orpcProxy.query[dialect],
    }
  }

  return {
    current: () => toTransport(resolveRoute()),
    open: async (
      open: (
        transport: ReturnType<typeof toTransport>
      ) => Promise<{ txId: string }>
    ) => {
      const route = resolveRoute()
      const opened = await open(toTransport(route))
      pinnedRoutes.set(opened.txId, route)
      return opened
    },
    pinned: (txId: string) =>
      toTransport(pinnedRoutes.get(txId) ?? resolveRoute()),
    release: (txId: string) => pinnedRoutes.delete(txId),
  }
}
