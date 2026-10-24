import { Dialect } from '@tamery/shared/enums/connection-type'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { ConnectionResource } from '~/core/connection/sync'
import {
  clickhouseEnumEntries,
  mysqlQuotedValues,
} from '~/core/queries/shared/inline-enum'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

export const enumType = type({
  metadata: type({
    column: 'string?',
    table: 'string?',
  }).optional(),
  name: 'string',
  schema: 'string',
  values: 'string[]',
})

export const findEnum = ({
  enums,
  column,
  table,
}: {
  enums: (typeof enumType.infer)[]
  column: {
    id: string
    enumName?: string
    type?: string
  }
  table: string
}) =>
  enums.find(
    (e) => e.metadata?.table === table && e.metadata?.column === column.id
  ) ??
  enums.find(
    (e) =>
      (column.enumName && e.name === column.enumName) ||
      (column.type && e.name === column.type)
  )

const resourceEnumsQuery = createQuery({
  query: {
    clickhouse: async (db) => {
      const query = await db
        // system.columns lists what the user may read without a grant; information_schema needs one.
        .selectFrom('system.columns')
        .select(['database as schema', 'table', 'name', 'type'])
        .where(({ and, eb }) =>
          and([
            eb('database', 'not in', [
              'INFORMATION_SCHEMA',
              'information_schema',
              'system',
            ]),
            eb('type', 'ilike', '%Enum%'),
          ])
        )
        .execute()

      return query
        .map(
          (row) =>
            ({
              metadata: {
                column: row.name,
                table: row.table,
              },
              name: row.name,
              schema: row.schema,
              values: clickhouseEnumEntries(row.type).map(
                (entry) => entry.value
              ),
            }) satisfies typeof enumType.infer
        )
        .filter((res) => res.values.length > 0)
    },
    mongodb: () => Promise.resolve([]),
    mssql: () => Promise.resolve([]),
    mysql: async (db) => {
      const query = await db
        .selectFrom('information_schema.COLUMNS')
        .select([
          'TABLE_SCHEMA as schema',
          'TABLE_NAME as table',
          'COLUMN_TYPE as value',
          'COLUMN_NAME as name',
        ])
        .where(({ or, and, eb }) =>
          and([
            eb(
              'TABLE_SCHEMA',
              'not in',
              getCapabilities(Dialect.MySQL).systemSchemas
            ),
            or([eb('DATA_TYPE', '=', 'enum'), eb('DATA_TYPE', '=', 'set')]),
          ])
        )
        .execute()

      return query.map(
        (row) =>
          ({
            metadata: {
              column: row.name,
              table: row.table,
            },
            name: row.name,
            schema: row.schema,
            values: mysqlQuotedValues(row.value),
          }) satisfies typeof enumType.infer
      )
    },
    oracle: () => Promise.resolve([]),
    postgres: async (db) => {
      const query = await db
        .selectFrom('pg_type')
        .innerJoin('pg_enum', 'pg_type.oid', 'pg_enum.enumtypid')
        .innerJoin(
          'pg_catalog.pg_namespace',
          'pg_type.typnamespace',
          'pg_catalog.pg_namespace.oid'
        )
        .select([
          'pg_catalog.pg_namespace.nspname as schema',
          'pg_type.typname as name',
          'pg_enum.enumlabel as value',
        ])
        .where('pg_catalog.pg_namespace.nspname', 'not in', [
          'pg_catalog',
          'information_schema',
        ])
        .orderBy('pg_enum.enumsortorder')
        .execute()

      const grouped = new Map<string, typeof enumType.infer>()

      for (const row of query) {
        const key = `${row.schema}.${row.name}`
        const existing = grouped.get(key)
        if (existing) {
          existing.values.push(row.value)
        } else {
          grouped.set(key, {
            name: row.name,
            schema: row.schema,
            values: [row.value],
          })
        }
      }

      return [...grouped.values()]
    },
    sqlite: () => Promise.resolve([]),
  },
  type: enumType.array(),
})

export const resourceEnumsQueryOptions = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) =>
  queryOptions({
    queryFn: async () =>
      resourceEnumsQuery.run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: ['connection-resource', connectionResource.id, 'enums'],
  })
