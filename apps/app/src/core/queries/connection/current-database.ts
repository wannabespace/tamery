import { SQLITE_RESOURCE_NAME } from '@tamery/connection/utils'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { sql } from 'kysely'

import type { Connection } from '~/core/connection/sync'
import { connectionToQueryParams, createQuery } from '~/core/runtime/query'

const connectionCurrentDatabaseQuery = createQuery({
  query: {
    clickhouse: (db) =>
      db
        .selectNoFrom(sql<string>`currentDatabase()`.as('name'))
        .executeTakeFirstOrThrow(),
    mongodb: async (db) => {
      const [stats] = await db.command<{ db: string }>('dbStats')
      return { name: stats?.db ?? null }
    },
    mssql: (db) =>
      db
        .selectNoFrom(sql<string>`DB_NAME()`.as('name'))
        .executeTakeFirstOrThrow(),
    mysql: (db) =>
      db
        .selectNoFrom(sql<string | null>`DATABASE()`.as('name'))
        .executeTakeFirstOrThrow(),
    oracle: (db) =>
      db
        .selectNoFrom(
          sql<string>`SYS_CONTEXT('USERENV', 'SERVICE_NAME')`.as('name')
        )
        .executeTakeFirstOrThrow(),
    postgres: (db) =>
      db
        .selectNoFrom(sql<string>`current_database()`.as('name'))
        .executeTakeFirstOrThrow(),
    sqlite: () => Promise.resolve({ name: SQLITE_RESOURCE_NAME }),
  },
  type: type({ name: 'string | null' }).pipe((row) => row.name),
})

export const connectionCurrentDatabaseQueryOptions = (connection: Connection) =>
  queryOptions({
    queryFn: async () =>
      connectionCurrentDatabaseQuery.run(
        await connectionToQueryParams(connection)
      ),
    queryKey: ['connection', connection.id, 'current-database'],
    throwOnError: false,
  })
