import {
  describeConnectionString,
  SQLITE_RESOURCE_NAME,
} from '@tamery/connection/utils'
import { Dialect } from '@tamery/shared/enums/connection-type'
import { eq, queryOnce } from '@tanstack/react-db'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { v7 } from 'uuid'

import { getCapabilities } from '~/core/catalog/capabilities'
import { getCollections, mutateOffline } from '~/core/collections'
import type { Connection } from '~/core/connection/sync'
import { duckdbCatalog } from '~/core/queries/shared/duckdb-catalog'
import { connectionToQueryParams, createQuery } from '~/core/runtime/query'
import { isViewOnly } from '~/core/workspace/utils'

const MONGODB_SYSTEM_DATABASES = new Set(['admin', 'config', 'local'])

const connectionResourcesQuery = (defaultResourceName: string | null) =>
  createQuery({
    query: {
      clickhouse: async (db) => {
        const rows = await db
          .selectFrom('system.databases')
          .select('name')
          .where('name', 'not in', [
            'INFORMATION_SCHEMA',
            'information_schema',
            'system',
          ])
          .orderBy('name')
          .execute()
        return rows.map((r) => r.name)
      },

      // A file lists only itself; MotherDuck every database of the workspace.
      duckdb: async (db) => {
        const rows = await db
          .selectFrom(duckdbCatalog('duckdb_databases').as('d'))
          .select('d.database_name')
          .where('d.internal', '=', false)
          .orderBy('d.database_name')
          .execute()
        return rows.map((r) => r.database_name)
      },

      mongodb: async (db) => {
        const [result] = await db.adminCommand<{
          databases: { name: string }[]
        }>('listDatabases', { authorizedDatabases: true, nameOnly: true })
        return (result?.databases ?? [])
          .map(({ name }) => name)
          .filter((name) => !MONGODB_SYSTEM_DATABASES.has(name))
          .toSorted()
      },

      mssql: async (db) => {
        const rows = await db
          .selectFrom('sys.databases')
          .select('name')
          .where('name', 'not in', ['master', 'model', 'msdb', 'tempdb'])
          .orderBy('name')
          .execute()
        return rows.map((r) => r.name)
      },

      mysql: async (db) => {
        const rows = await db
          .selectFrom('information_schema.SCHEMATA')
          .select('SCHEMA_NAME')
          .where(
            'SCHEMA_NAME',
            'not in',
            getCapabilities(Dialect.MySQL).systemSchemas
          )
          .orderBy('SCHEMA_NAME')
          .execute()
        return rows.map((r) => r.SCHEMA_NAME)
      },

      oracle: () =>
        Promise.resolve(defaultResourceName ? [defaultResourceName] : []),

      postgres: async (db) => {
        const rows = await db
          .selectFrom('pg_catalog.pg_database')
          .select('datname')
          .where('datistemplate', '=', false)
          .orderBy('datname')
          .execute()
        return rows.map((r) => r.datname)
      },
      sqlite: () => Promise.resolve([SQLITE_RESOURCE_NAME]),
    },
    type: type('string[]'),
  })

const storeResources = async (
  connection: Connection,
  names: string[],
  prune?: { keep: string | null }
) => {
  const { connectionsResourcesCollection, workspacesCollection } =
    getCollections()

  await connectionsResourcesCollection.utils.whenSynced()

  const stored = await queryOnce((q) =>
    q
      .from({ resource: connectionsResourcesCollection })
      .where(({ resource }) => eq(resource.connectionId, connection.id))
      .select(({ resource }) => ({ id: resource.id, name: resource.name }))
  )
  const storedNames = new Set(stored.map((resource) => resource.name))
  const listedNames = new Set<string | null>([...names, prune?.keep ?? null])
  const missing = names.filter((name) => !storedNames.has(name))
  // Only an editor may remove a resource.
  const gone =
    prune &&
    !isViewOnly(workspacesCollection.get(connection.workspaceId) ?? null)
      ? stored.filter((resource) => !listedNames.has(resource.name))
      : []

  if (missing.length > 0 || gone.length > 0) {
    mutateOffline(() => {
      for (const name of missing) {
        connectionsResourcesCollection.insert({
          connectionId: connection.id,
          createdAt: new Date(),
          id: v7(),
          name,
          updatedAt: new Date(),
        })
      }
      if (gone.length > 0) {
        connectionsResourcesCollection.delete(
          gone.map((resource) => resource.id)
        )
      }
    })
  }
}

export const connectionResourcesQueryOptions = (connection: Connection) =>
  queryOptions({
    queryFn: async () => {
      const params = await connectionToQueryParams(connection)
      const { defaultResourceName } = describeConnectionString(
        params.connectionString
      )

      // Before the list, which can take seconds or fail: the connection row links only to a stored resource.
      if (defaultResourceName) {
        await storeResources(connection, [defaultResourceName])
      }

      const resources =
        await connectionResourcesQuery(defaultResourceName).run(params)

      // The connection's own database stays: the list may hide it (a system or empty database) and the connection row links to it.
      await storeResources(connection, resources, {
        keep: defaultResourceName || null,
      })

      return resources
    },
    queryKey: ['connection', connection.id, 'resources'],
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  })
