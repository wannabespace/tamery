import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import type { Kysely, RawBuilder } from 'kysely'
import { sql } from 'kysely'

import type { Connection } from '~/core/connection/sync'
import { connectionToQueryParams, createQuery } from '~/core/runtime/query'

const connectionVersionType = type({
  version: 'string',
}).pipe((data) => data.version)

const readVersion =
  (expression: RawBuilder<string>) =>
  // oxlint-disable-next-line ts/no-explicit-any
  async (db: Kysely<any>) => {
    const row = await db
      .selectNoFrom(expression.as('version'))
      .executeTakeFirst()

    if (!row) {
      throw new Error('Failed to read database version')
    }

    return row
  }

const connectionVersionQuery = createQuery({
  query: {
    clickhouse: readVersion(sql`version()`),
    mongodb: async (db) => {
      const [info] = await db.command<{ version: string }>('buildInfo')
      return { version: info?.version ?? '' }
    },
    mssql: readVersion(sql`SERVERPROPERTY('ProductVersion')`),
    mysql: readVersion(sql`VERSION()`),
    oracle: (db) =>
      db
        .selectFrom('PRODUCT_COMPONENT_VERSION')
        .select('VERSION as version')
        .where('PRODUCT', 'like', 'Oracle%')
        .executeTakeFirstOrThrow(),
    postgres: readVersion(sql`current_setting('server_version')`),
    sqlite: readVersion(sql`sqlite_version()`),
  },
  type: connectionVersionType,
})

export const connectionVersionQueryOptions = (connection: Connection) =>
  queryOptions({
    queryFn: async () =>
      connectionVersionQuery.run(await connectionToQueryParams(connection)),
    queryKey: ['connection-resource', connection.id, 'version'],
    throwOnError: false,
  })
