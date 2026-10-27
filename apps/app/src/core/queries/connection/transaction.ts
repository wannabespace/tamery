import { silently } from '@tamery/shared/utils'
import type { Type } from 'arktype'
import type { Kysely, TransactionSettings } from 'kysely'
import { CompiledQuery } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { ResultSet } from './custom'
import { resultSetsType } from './custom'

interface TransactionOptions extends TransactionSettings {
  commit: boolean
}

export const runInTransaction = async <DB>(
  db: Kysely<DB>,
  { accessMode, commit, isolationLevel }: TransactionOptions,
  compiled: CompiledQuery[]
) => {
  let begin = db.startTransaction()
  if (accessMode) {
    begin = begin.setAccessMode(accessMode)
  }
  if (isolationLevel) {
    begin = begin.setIsolationLevel(isolationLevel)
  }
  const trx = await begin.execute()
  try {
    const sets: ResultSet[] = []
    for (const query of compiled) {
      // Sequential by design: the statements run in order inside one transaction.
      // oxlint-disable-next-line no-await-in-loop
      sets.push(...resultSetsType.assert(await trx.executeQuery(query)))
    }
    await (commit ? trx.commit() : trx.rollback()).execute()
    return sets
  } catch (error) {
    await silently(() => trx.rollback().execute())
    throw error
  }
}

export const transactionQuery = ({
  statements,
  ...options
}: TransactionOptions & { statements: string[] }) => {
  const compiled = statements.map((statement) => CompiledQuery.raw(statement))
  const run = <DB>(db: Kysely<DB>) => runInTransaction(db, options, compiled)

  return createQuery<Type<ResultSet[]>>({
    query: {
      clickhouse: run,
      mongodb: (db) =>
        db.transaction(options).execute(async (tx) => {
          const sets: ResultSet[] = []
          for (const statement of statements) {
            // Sequential by design: the statements run in order inside one transaction.
            // oxlint-disable-next-line no-await-in-loop
            sets.push(...(await tx.run(statement)))
          }
          return sets
        }),
      mssql: run,
      mysql: run,
      oracle: run,
      postgres: run,
      sqlite: run,
    },
  })
}
