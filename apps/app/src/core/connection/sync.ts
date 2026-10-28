import { connectionSecrets } from '@tamery/connection/secrets'
import type {
  ConnectionType,
  Provider,
} from '@tamery/shared/enums/connection-type'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { SafeURL } from '@tamery/shared/safe-url'
import { persistedCollectionOptions } from '@tanstack/browser-db-sqlite-persistence'
import { createCollection } from '@tanstack/react-db'

import { persistence } from '~/lib/database'
import { orpc } from '~/lib/orpc'
import type { BaseTable } from '~/lib/sync'
import { PERSISTED_SCHEMA_VERSION, syncCollectionOptions } from '~/lib/sync'

import type { ConnectionStringsCollection } from './connection-strings'

export interface Connection extends BaseTable {
  type: ConnectionType
  workspaceId: string
  name: string
  label: string | null
  color: string | null
  isPasswordExists: boolean
  provider: Provider | null
  syncType: SyncType
}

const prepareConnectionToCloud = async (
  connectionStrings: ConnectionStringsCollection,
  connection: Connection
) => {
  if (connection.syncType === SyncType.CloudWithoutConnectionString) {
    return { ...connection, connectionString: null }
  }

  const connectionString = await connectionStrings.utils.decrypt(connection.id)

  return {
    ...connection,
    connectionString:
      connection.syncType === SyncType.Cloud
        ? new SafeURL(connectionString.trim()).toString()
        : connectionSecrets.strip(connectionString.trim()),
  }
}

export interface ConnectionResource extends BaseTable {
  connectionId: string
  name: string | null
}

export const createConnectionsCollection = (
  connectionStrings: ConnectionStringsCollection
) => {
  const collection = createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<Connection>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.connections.events.call(
            undefined,
            { signal }
          )) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'connections',
        mutations: {
          delete: (id) => orpc.connections.remove.call({ id }),
          insert: async (value) =>
            orpc.connections.create.call(
              await prepareConnectionToCloud(connectionStrings, value)
            ),
          update: async (_id, _changes, row) =>
            orpc.connections.update.call(
              await prepareConnectionToCloud(connectionStrings, row)
            ),
        },
        sync: ({ rows, signal }) =>
          orpc.connections.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )

  collection.subscribeChanges((changes) => {
    for (const change of changes) {
      const { id } = change.value
      if (change.type === 'delete' && connectionStrings.has(id)) {
        connectionStrings.delete(id)
      }
    }
  })

  return collection
}

export const createConnectionsResourcesCollection = () =>
  createCollection(
    persistedCollectionOptions({
      ...syncCollectionOptions<ConnectionResource>({
        events: async ({ signal, write }) => {
          for await (const message of await orpc.connectionsResources.events.call(
            undefined,
            { signal }
          )) {
            write(message)
          }
        },
        getKey: (item) => item.id,
        id: 'connections-resources',
        mutations: {
          insert: (value) => orpc.connectionsResources.create.call(value),
        },
        sync: ({ rows, signal }) =>
          orpc.connectionsResources.sync.call(rows, { signal }),
      }),
      persistence,
      schemaVersion: PERSISTED_SCHEMA_VERSION,
    })
  )
