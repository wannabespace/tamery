import { unsupported } from '@tamery/shared/unsupported'
import type { Type } from 'arktype'
import { CompiledQuery } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { ResultSet } from './custom'
import { runInTransaction } from './transaction'

/** A statement's plan in the engine's own words. `analyze` runs it, so the caller passes it only for a read; both engines roll back either way. */
export const explainQuery = ({
  analyze,
  statement,
}: {
  analyze: boolean
  statement: string
}) =>
  createQuery<Type<ResultSet[]>>({
    query: {
      clickhouse: (db) =>
        runInTransaction(db, { accessMode: 'read only', commit: false }, [
          CompiledQuery.raw(`EXPLAIN ${statement}`),
        ]),
      mongodb: unsupported('Query plans'),
      mssql: unsupported('Query plans'),
      // Not read only: MySQL refuses even EXPLAIN of a write there.
      mysql: (db) =>
        runInTransaction(db, { commit: false }, [
          CompiledQuery.raw(`EXPLAIN ${analyze ? 'ANALYZE ' : ''}${statement}`),
        ]),
      oracle: unsupported('Query plans'),
      postgres: (db) =>
        runInTransaction(db, { accessMode: 'read only', commit: false }, [
          CompiledQuery.raw(
            `EXPLAIN (${analyze ? 'ANALYZE, ' : ''}FORMAT TEXT) ${statement}`
          ),
        ]),
      sqlite: (db) =>
        runInTransaction(db, { commit: false }, [
          CompiledQuery.raw(`EXPLAIN QUERY PLAN ${statement}`),
        ]),
    },
  })
