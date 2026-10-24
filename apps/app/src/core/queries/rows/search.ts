import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import type { Kysely } from 'kysely'

import type { ConnectionResource } from '~/core/connection/sync'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { resourceRowsQueryKey } from './list'
import type { ContainsText } from './shape'
import { fromMongodbDocument, mongodbTextContains, textContains } from './shape'

const rowsType = type('Record<string, unknown>[]')

interface SearchRowsParams {
  columns: string[]
  limit: number
  schema: string
  table: string
  term: string
}

const searchRows = (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  contains: ContainsText,
  { columns, limit, schema, table, term }: SearchRowsParams
) =>
  db
    .withSchema(schema)
    .$extendTables<Record<string, Record<string, unknown>>>()
    .selectFrom(table)
    .selectAll()
    .$if(term !== '', (query) =>
      query.where((eb) =>
        eb.or(columns.map((column) => contains(eb, column, `%${term}%`)))
      )
    )
    .limit(limit)
    .execute()

/** `%` and `_` in `term` act as wildcards. */
export const searchRowsQuery = (params: SearchRowsParams) =>
  createQuery({
    query: {
      clickhouse: (db) => searchRows(db, textContains.clickhouse, params),
      mongodb: async (db) => {
        const filter =
          params.term === ''
            ? {}
            : {
                $or: params.columns.map((column) =>
                  mongodbTextContains(column, params.term)
                ),
              }
        const collection = db.collection(params.table)
        // oxlint-disable-next-line unicorn/no-array-method-this-argument -- a collection's find takes options, not a thisArg
        const documents = await collection.find(filter, { limit: params.limit })
        return documents.map(fromMongodbDocument)
      },
      mssql: (db) => searchRows(db, textContains.mssql, params),
      mysql: (db) => searchRows(db, textContains.mysql, params),
      oracle: (db) => searchRows(db, textContains.oracle, params),
      postgres: (db) => searchRows(db, textContains.postgres, params),
      sqlite: (db) => searchRows(db, textContains.sqlite, params),
    },
    type: rowsType,
  })

export const searchRowsQueryOptions = ({
  connectionResource,
  ...params
}: SearchRowsParams & { connectionResource: ConnectionResource }) =>
  queryOptions({
    queryFn: async () =>
      searchRowsQuery(params).run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: [
      ...resourceRowsQueryKey({ connectionResource, ...params }),
      'search',
      params.columns,
      params.term,
      params.limit,
    ],
  })
