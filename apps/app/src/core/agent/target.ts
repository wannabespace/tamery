import type { McpTarget } from '@tamery/shared/mcp'

import { getCollections } from '~/core/collections'
import { fetchingConfig } from '~/core/connection/fetching-config'
import { getConnectionStore } from '~/core/connection/stores'
import type { Connection } from '~/core/connection/sync'
import { queryClient } from '~/lib/query-client'

const AGENT_STALE_TIME = 5000

export const fetchForAgent: typeof queryClient.query = (options) =>
  queryClient.query({ ...options, staleTime: AGENT_STALE_TIME })

export const getResources = (connectionId: string) =>
  getCollections().connectionsResourcesCollection.toArray.flatMap((resource) =>
    resource.connectionId === connectionId && resource.name
      ? [resource.name]
      : []
  )

const openResources = (connection: Connection) => {
  const resources = getResources(connection.id)
  return resources.length > 0
    ? `Its open resources: ${resources.join(', ')}.`
    : `Ask the user to open one of its resources in Tamery.`
}

export const resolveTarget = ({
  connectionId,
  resource: resourceName,
}: McpTarget) => {
  const {
    connectionStringsCollection,
    connectionsCollection,
    connectionsResourcesCollection,
  } = getCollections()
  const connection = connectionsCollection.get(connectionId)
  if (!connection) {
    throw new Error(
      `Connection "${connectionId}" not found. Call list_connections for valid ids.`
    )
  }

  const connectionString = connectionStringsCollection.get(connectionId) ?? null
  const { canSend, reason } = fetchingConfig(connection, {
    connectionString,
    proxy: getConnectionStore(connectionId).get().proxy,
  })
  if (!canSend) {
    throw new Error(reason ?? `Open "${connection.name}" in Tamery first.`)
  }

  const name = resourceName ?? connectionString?.defaultResourceName ?? null
  const resource = connectionsResourcesCollection.toArray.find(
    (item) => item.connectionId === connectionId && item.name === name
  )
  if (resourceName && !resource) {
    throw new Error(
      `"${connection.name}" has no open resource "${resourceName}". ${openResources(connection)} The user can open another in Tamery.`
    )
  }

  return { connection, resource }
}

export const resolveResource = (target: McpTarget) => {
  const { connection, resource } = resolveTarget(target)
  if (!resource) {
    throw new Error(
      `Pass a resource for "${connection.name}". ${openResources(connection)}`
    )
  }
  return { connection, resource }
}
