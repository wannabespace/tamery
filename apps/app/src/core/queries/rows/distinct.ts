import { type } from 'arktype'
import type { Kysely } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import { fromMongodbDocument } from './shape'

const distinctType = type('Record<string, unknown>[]')

const DISTINCT_LIMIT = 1000

interface DistinctParams {
  schema: string
  table: string
  column: string
}

const selectDistinct = (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  { schema, table, column }: DistinctParams
) =>
  db
    .withSchema(schema)
    .$extendTables<Record<string, Record<string, unknown>>>()
    .selectFrom(table)
    .select(column)
    .distinct()
    .limit(DISTINCT_LIMIT)
    .execute()

export const distinctQuery = (params: DistinctParams) =>
  createQuery({
    query: {
      clickhouse: (db) => selectDistinct(db, params),
      mongodb: async (db) => {
        const values = await db
          .collection(params.table)
          .aggregate([
            { $group: { _id: `$${params.column}` } },
            { $limit: DISTINCT_LIMIT },
            { $project: { _id: 0, [params.column]: '$_id' } },
          ])
        return values.map(fromMongodbDocument)
      },
      mssql: (db) => selectDistinct(db, params),
      mysql: (db) => selectDistinct(db, params),
      oracle: (db) => selectDistinct(db, params),
      postgres: (db) => selectDistinct(db, params),
      sqlite: (db) => selectDistinct(db, params),
    },
    type: distinctType,
  })
