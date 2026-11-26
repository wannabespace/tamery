import { getCollections } from '~/core/collections'
import { fetchingConfig } from '~/core/connection/fetching-config'
import type { Connection } from '~/core/connection/sync'
import {
  CLOUD,
  getConnectionRunsOn,
  getMachineRoute,
} from '~/core/runtime/machine/pairing'
import { queryClient } from '~/lib/query-client'

const AGENT_STALE_TIME = 5000

/** A null resource is the connection's own database. */
export interface AgentTarget {
  connectionId: string
  resource: string | null
}

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
}: AgentTarget) => {
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
    inCloud: getConnectionRunsOn(connectionId) === CLOUD,
    machine: getMachineRoute(connectionId),
    connectionString,
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

export const resolveResource = (target: AgentTarget) => {
  const { connection, resource } = resolveTarget(target)
  if (!resource) {
    throw new Error(
      `Pass a resource for "${connection.name}". ${openResources(connection)}`
    )
  }
  return { connection, resource }
}
