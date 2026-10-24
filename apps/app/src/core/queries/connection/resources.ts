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
import { connectionToQueryParams, createQuery } from '~/core/runtime/query'

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

export const connectionResourcesQueryOptions = (connection: Connection) =>
  queryOptions({
    queryFn: async () => {
      const { connectionsResourcesCollection } = getCollections()
      const params = await connectionToQueryParams(connection)
      const resources = await connectionResourcesQuery(
        describeConnectionString(params.connectionString).defaultResourceName
      ).run(params)

      await connectionsResourcesCollection.utils.whenSynced()

      const stored = await queryOnce((q) =>
        q
          .from({ resource: connectionsResourcesCollection })
          .where(({ resource }) => eq(resource.connectionId, connection.id))
          .select(({ resource }) => ({ name: resource.name }))
      )
      const storedNames = new Set(stored.map((resource) => resource.name))
      const missing = resources.filter((name) => !storedNames.has(name))

      if (missing.length > 0) {
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
        })
      }

      return resources
    },
    queryKey: ['connection', connection.id, 'resources'],
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  })
