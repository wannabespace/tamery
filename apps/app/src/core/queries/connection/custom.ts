import type { Type } from 'arktype'
import { type } from 'arktype'
import type { Kysely } from 'kysely'
import { CompiledQuery } from 'kysely'

import { createQuery } from '~/core/runtime/query'

const resultSetType = type({
  affectedRows: 'number | null',
  columns: 'string[]',
  rows: 'unknown[][]',
  truncated: 'boolean',
})

export type ResultSet = typeof resultSetType.infer

export const resultSetsType = type({ rows: resultSetType.array() }).pipe(
  ({ rows }) => rows
)

// No `type` option on purpose: it would opt a write into retries on reconnect, so the sets are checked inside.
export const customQuery = ({
  query,
  values,
}: {
  query: string
  values?: unknown[]
}) => {
  const compiled = CompiledQuery.raw(query, values)
  const run = async <DB>(db: Kysely<DB>) =>
    resultSetsType.assert(await db.executeQuery(compiled))

  return createQuery<Type<ResultSet[]>>({
    query: {
      clickhouse: run,
      mongodb: (db) => db.run(query),
      mssql: run,
      mysql: run,
      oracle: run,
      postgres: run,
      sqlite: run,
    },
  })
}
