import type { ColumnTypes } from '@tamery/connection/queries/value-binding'
import { filterValueBindings } from '@tamery/connection/queries/value-binding'
import { Dialect } from '@tamery/shared/enums/connection-type'
import type { ActiveFilter, FilterValueBinding } from '@tamery/shared/filters'
import { toKyselyFilter } from '@tamery/shared/filters'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { Result } from 'better-result'
import type { AliasableExpression, Kysely } from 'kysely'
import { sql } from 'kysely'
import { memoize } from 'memoza'

import type { ConnectionResource } from '~/core/connection/sync'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import type { BindValue } from './shape'
import {
  bindValue,
  clickhouseWrite,
  matchesPrimaryKeys,
  mongodbDocument,
  mongodbMatch,
  rowsPerStatement,
} from './shape'

interface CountTarget {
  filters: ActiveFilter[]
  schema: string
  table: string
}

const countRows = async (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  total: AliasableExpression<unknown>,
  { filters, schema, table }: CountTarget,
  bind?: FilterValueBinding
) => {
  const query = await db
    .withSchema(schema)
    .$extendTables<Record<string, Record<string, unknown>>>()
    .selectFrom(table)
    .select(total.as('total'))
    .where((eb) => toKyselyFilter(eb, filters, 'AND', bind))
    .executeTakeFirst()

  return { count: Number(query?.total ?? 0), isEstimated: false }
}

export const resourceTableTotalQuery = memoize(
  ({
    columns = [],
    table,
    schema,
    query: { filters, exact },
  }: {
    /** The table's columns, whose types ClickHouse and SQLite bind filter values by. */
    columns?: ColumnTypes
    table: string
    schema: string
    query: {
      filters: ActiveFilter[]
      exact: boolean
    }
  }) => {
    const target = { filters, schema, table }

    return createQuery({
      query: {
        clickhouse: async (db) => {
          if (!exact && !filters?.length) {
            // system.parts needs a grant a read-only user often lacks; the exact count below does not.
            const estimate = await Result.tryPromise(() =>
              db
                .selectFrom('system.parts')
                .select(db.fn.sum(sql.ref('rows')).as('count'))
                .where('database', '=', schema)
                .where('table', '=', table)
                .where('active', '=', 1)
                .executeTakeFirst()
            )

            const count = Number(estimate.unwrapOr(null)?.count)
            if (count > 0) {
              return { count, isEstimated: true }
            }
          }

          return countRows(
            db,
            db.fn.countAll(),
            target,
            filterValueBindings.clickhouse?.(columns)
          )
        },
        mongodb: async (db) => {
          const collection = db.collection(table)
          if (!exact && !filters?.length) {
            const count = await collection.estimatedDocumentCount()
            if (count > 0) {
              return { count, isEstimated: true }
            }
          }
          const [counted] = await collection.aggregate<{ count: number }>([
            ...mongodbMatch(columns, filters),
            { $count: 'count' },
          ])
          return { count: counted?.count ?? 0, isEstimated: false }
        },
        mssql: (db) => countRows(db, sql`count_big(*)`, target),
        mysql: async (db) => {
          if (!exact && !filters?.length) {
            const estimate = await db
              .selectFrom('information_schema.TABLES')
              .select('TABLE_ROWS as count')
              .where('TABLE_SCHEMA', '=', schema)
              .where('TABLE_NAME', '=', table)
              .executeTakeFirst()

            if (estimate && estimate.count !== null && estimate.count > 0) {
              return { count: estimate.count, isEstimated: true }
            }
          }

          return countRows(db, db.fn.countAll(), target)
        },
        oracle: async (db) => {
          if (!exact && !filters?.length) {
            const estimate = await db
              .selectFrom('ALL_TABLES')
              .select('NUM_ROWS as count')
              .where('OWNER', '=', schema)
              .where('TABLE_NAME', '=', table)
              .executeTakeFirst()

            if (estimate && estimate.count !== null && estimate.count > 0) {
              return { count: estimate.count, isEstimated: true }
            }
          }

          return countRows(db, db.fn.countAll(), target)
        },
        postgres: async (db) => {
          if (!exact && !filters?.length) {
            const estimate = await db
              .selectFrom('pg_catalog.pg_class')
              .innerJoin(
                'pg_catalog.pg_namespace',
                'pg_catalog.pg_namespace.oid',
                'pg_catalog.pg_class.relnamespace'
              )
              .select('pg_catalog.pg_class.reltuples as count')
              .where('pg_catalog.pg_namespace.nspname', '=', schema)
              .where('pg_catalog.pg_class.relname', '=', table)
              .executeTakeFirst()

            if (estimate && estimate.count !== null && estimate.count > 0) {
              return {
                count: Math.round(estimate.count),
                isEstimated: true,
              }
            }
          }

          return countRows(db, db.fn.countAll(), target)
        },
        sqlite: (db) =>
          countRows(
            db,
            db.fn.countAll(),
            target,
            filterValueBindings.sqlite?.(columns)
          ),
      },
      type: type({
        count: 'number',
        isEstimated: 'boolean',
      }),
    })
  }
)

export const resourceTableTotalQueryKey = ({
  connectionResource,
  table,
  schema,
}: {
  connectionResource: ConnectionResource
  table: string
  schema: string
}) => [
  'connection-resource',
  connectionResource.id,
  'schema',
  schema,
  'table',
  table,
  'total',
]

export const resourceTableTotalQueryOptions = ({
  columns,
  connectionResource,
  table,
  schema,
  query: { filters, exact },
}: {
  columns?: ColumnTypes
  connectionResource: ConnectionResource
  table: string
  schema: string
  query: { filters: ActiveFilter[]; exact: boolean }
}) =>
  queryOptions({
    queryFn: async () =>
      resourceTableTotalQuery({
        columns,
        query: { exact, filters },
        schema,
        table,
      }).run(await connectionResourceToQueryParams(connectionResource)),
    queryKey: [
      ...resourceTableTotalQueryKey({ connectionResource, schema, table }),
      {
        exact,
        filters,
      },
    ],
    throwOnError: false,
  })

interface KeyedRowsTarget {
  columns: ColumnTypes
  primaryKeys: Record<string, unknown>[]
  schema: string
  table: string
}

const countKeyedRows = async (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  bind: BindValue,
  dialect: Dialect,
  { columns, primaryKeys, schema, table }: KeyedRowsTarget
) => {
  const batchSize = rowsPerStatement(
    dialect,
    Object.keys(primaryKeys[0] ?? {}).length
  )
  let total = 0
  for (let index = 0; index < primaryKeys.length; index += batchSize) {
    // oxlint-disable-next-line no-await-in-loop
    const batch = await db
      .withSchema(schema)
      .$extendTables<Record<string, Record<string, unknown>>>()
      .selectFrom(table)
      .select(db.fn.countAll().as('total'))
      .where((eb) =>
        eb.or(
          primaryKeys
            .slice(index, index + batchSize)
            .map((pk) => matchesPrimaryKeys(eb, bind, columns, pk))
        )
      )
      .executeTakeFirst()
    total += Number(batch?.total ?? 0)
  }
  return total
}

/** How many rows a write by these keys touches: more than the keys when they are not unique, as ClickHouse's are not. */
export const keyedRowsCountQuery = (target: KeyedRowsTarget) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        clickhouseWrite((bind) =>
          countKeyedRows(db, bind, Dialect.ClickHouse, target)
        ),
      mongodb: (db) =>
        db.collection(target.table).countDocuments({
          $or: target.primaryKeys.map((pk) =>
            mongodbDocument(target.columns, pk)
          ),
        }),
      mssql: (db) => countKeyedRows(db, bindValue.mssql, Dialect.MSSQL, target),
      mysql: (db) => countKeyedRows(db, bindValue.mysql, Dialect.MySQL, target),
      oracle: (db) =>
        countKeyedRows(db, bindValue.oracle, Dialect.Oracle, target),
      postgres: (db) =>
        countKeyedRows(db, bindValue.postgres, Dialect.Postgres, target),
      sqlite: (db) =>
        countKeyedRows(db, bindValue.sqlite, Dialect.SQLite, target),
    },
    type: type('number'),
  })
