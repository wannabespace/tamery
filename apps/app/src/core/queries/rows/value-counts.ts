import type { ColumnTypes } from '@tamery/connection/queries/value-binding'
import { filterSpellings } from '@tamery/connection/queries/value-binding'
import { fromWire } from '@tamery/mongo/values'
import type { ActiveFilter, FilterSpelling } from '@tamery/shared/filters'
import { toKyselyFilter } from '@tamery/shared/filters'
import { type } from 'arktype'
import type { Kysely } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { ContainsText } from './shape'
import { mongodbMatch, mongodbTextContains, textContains } from './shape'

const valueCountsType = type({
  count: type('number | string | bigint').pipe(Number),
  value: 'unknown',
}).array()

interface ValueCountsParams {
  column: string
  /** The table's columns, whose types ClickHouse and SQLite bind filter values by. */
  columns: ColumnTypes
  filters: ActiveFilter[]
  limit: number
  schema: string
  table: string
  term: string
}

const countValues = (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  contains: ContainsText,
  { column, filters, limit, schema, table, term }: ValueCountsParams,
  spelling: FilterSpelling
) =>
  db
    .withSchema(schema)
    .$extendTables<Record<string, Record<string, unknown>>>()
    .selectFrom(table)
    .select((eb) => [eb.ref(column).as('value'), eb.fn.countAll().as('count')])
    .where((eb) => toKyselyFilter(eb, filters, 'AND', spelling))
    .$if(term !== '', (query) =>
      query.where((eb) => contains(eb, column, `%${term}%`))
    )
    .groupBy(column)
    .orderBy('count', 'desc')
    .limit(limit)
    .execute()

/** `%` and `_` in `term` act as wildcards. */
export const valueCountsQuery = (params: ValueCountsParams) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        countValues(
          db,
          textContains.clickhouse,
          params,
          filterSpellings.clickhouse(params.columns)
        ),
      duckdb: (db) =>
        countValues(
          db,
          textContains.duckdb,
          params,
          filterSpellings.duckdb(params.columns)
        ),
      mongodb: async (db) => {
        const field = `$${params.column}`
        const counts = await db.collection(params.table).aggregate<{
          count: number
          value: unknown
        }>([...mongodbMatch(params.columns, params.filters), ...(params.term === '' ? [] : [{ $match: mongodbTextContains(params.column, params.term) }]), { $group: { _id: field, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: params.limit }, { $project: { _id: 0, count: 1, value: '$_id' } }])
        return counts.map(({ count, value }) => ({
          count,
          value: fromWire(value),
        }))
      },
      mssql: (db) =>
        countValues(
          db,
          textContains.mssql,
          params,
          filterSpellings.mssql(params.columns)
        ),
      mysql: (db) =>
        countValues(
          db,
          textContains.mysql,
          params,
          filterSpellings.mysql(params.columns)
        ),
      oracle: (db) =>
        countValues(
          db,
          textContains.oracle,
          params,
          filterSpellings.oracle(params.columns)
        ),
      postgres: (db) =>
        countValues(
          db,
          textContains.postgres,
          params,
          filterSpellings.postgres(params.columns)
        ),
      sqlite: (db) =>
        countValues(
          db,
          textContains.sqlite,
          params,
          filterSpellings.sqlite(params.columns)
        ),
    },
    type: valueCountsType,
  })
