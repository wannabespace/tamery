import type { ColumnTypes } from '@tamery/connection/queries/value-binding'
import { filterValueBindings } from '@tamery/connection/queries/value-binding'
import type { ActiveFilter, FilterValueBinding } from '@tamery/shared/filters'
import { toKyselyFilter } from '@tamery/shared/filters'
import { type } from 'arktype'
import type { Kysely } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import { fromMongodbDocument, mongodbMatch } from './shape'

const count = type('number | string | bigint').pipe(Number)

const statsType = type({
  filled: count,
  'max?': 'unknown',
  'min?': 'unknown',
  total: count,
  unique: count,
})

interface ColumnStatsParams {
  column: string
  /** The table's columns, whose types ClickHouse and SQLite bind filter values by. */
  columns: ColumnTypes
  filters: ActiveFilter[]
  ranged: boolean
  schema: string
  table: string
}

const selectStats = (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  { column, filters, ranged, schema, table }: ColumnStatsParams,
  bind?: FilterValueBinding
) =>
  db
    .withSchema(schema)
    .$extendTables<Record<string, Record<string, unknown>>>()
    .selectFrom(table)
    .select((eb) => [
      eb.fn.countAll().as('total'),
      eb.fn.count(column).as('filled'),
      eb.fn.count(column).distinct().as('unique'),
    ])
    .$if(ranged, (query) =>
      query.select((eb) => [
        eb.fn.min(column).as('min'),
        eb.fn.max(column).as('max'),
      ])
    )
    .where((eb) => toKyselyFilter(eb, filters, 'AND', bind))
    .executeTakeFirstOrThrow()

// Pass `ranged` only for ordered types: it adds min and max.
export const columnStatsQuery = (params: ColumnStatsParams) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        selectStats(
          db,
          params,
          filterValueBindings.clickhouse?.(params.columns)
        ),
      mongodb: async (db) => {
        const field = `$${params.column}`
        const [result] = await db.collection(params.table).aggregate<{
          stats: Record<string, unknown>[]
          unique: { count: number }[]
        }>([
          ...mongodbMatch(params.columns, params.filters),
          {
            $facet: {
              stats: [
                {
                  $group: {
                    _id: null,
                    filled: {
                      $sum: {
                        $cond: [
                          { $eq: [{ $ifNull: [field, null] }, null] },
                          0,
                          1,
                        ],
                      },
                    },
                    total: { $sum: 1 },
                    ...(params.ranged && {
                      max: { $max: field },
                      min: { $min: field },
                    }),
                  },
                },
              ],
              unique: [
                { $match: { [params.column]: { $ne: null } } },
                { $group: { _id: field } },
                { $count: 'count' },
              ],
            },
          },
        ])
        const { _id, ...stats } = fromMongodbDocument(result?.stats[0] ?? {})
        return {
          filled: 0,
          total: 0,
          ...stats,
          unique: result?.unique[0]?.count ?? 0,
        }
      },
      mssql: (db) => selectStats(db, params),
      mysql: (db) => selectStats(db, params),
      oracle: (db) => selectStats(db, params),
      postgres: (db) => selectStats(db, params),
      sqlite: (db) =>
        selectStats(db, params, filterValueBindings.sqlite?.(params.columns)),
    },
    type: statsType,
  })
