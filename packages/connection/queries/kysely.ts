import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect } from '@tamery/shared/enums/connection-type'
import type { CompiledQuery, Dialect as KyselyDialect } from 'kysely'
import {
  DummyDriver,
  Kysely,
  MssqlAdapter,
  MysqlAdapter,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteQueryCompiler,
} from 'kysely'
import { memoize } from 'memoza'

import { prepareQuery } from './dialects/clickhouse/prepare-query'
import { ClickhouseQueryCompiler } from './dialects/clickhouse/query-compiler'
import { MssqlQueryCompiler } from './dialects/mssql/query-compiler'
import { OracleQueryCompiler } from './dialects/oracle/query-compiler'
import { PosthogQueryCompiler } from './dialects/posthog/query-compiler'

const createBareAdapter = () => ({
  acquireMigrationLock: () => Promise.resolve(),
  releaseMigrationLock: () => Promise.resolve(),
  supportsCreateIfNotExists: false,
  supportsReturning: false,
  supportsTransactionalDdl: false,
})

const createIntrospector = () => {
  throw new Error('Not implemented')
}

export const kyselyDialects = {
  clickhouse: {
    createAdapter: createBareAdapter,
    createIntrospector,
    createQueryCompiler: () => new ClickhouseQueryCompiler(),
  },
  mssql: {
    createAdapter: () => new MssqlAdapter(),
    createIntrospector,
    createQueryCompiler: () => new MssqlQueryCompiler(),
  },
  mysql: {
    createAdapter: () => new MysqlAdapter(),
    createIntrospector,
    createQueryCompiler: () => new MysqlQueryCompiler(),
  },
  oracle: {
    createAdapter: createBareAdapter,
    createIntrospector,
    createQueryCompiler: () => new OracleQueryCompiler(),
  },
  postgres: {
    createAdapter: () => new PostgresAdapter(),
    createIntrospector,
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  posthog: {
    createAdapter: createBareAdapter,
    createIntrospector,
    createQueryCompiler: () => new PosthogQueryCompiler(),
  },
  sqlite: {
    createAdapter: () => new SqliteAdapter(),
    createIntrospector,
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
} satisfies Record<SqlDialect, Omit<KyselyDialect, 'createDriver'>>

/** Compile-only: executing on one fails. Run what it compiles through `toQueryPayload`. */
export const coldDialect = memoize(
  (dialect: SqlDialect) =>
    new Kysely({
      dialect: {
        ...kyselyDialects[dialect],
        createDriver: () => new DummyDriver(),
      },
    })
)

export const toQueryPayload = (dialect: SqlDialect, compiled: CompiledQuery) =>
  dialect === Dialect.ClickHouse || dialect === Dialect.PostHog
    ? { query: prepareQuery(compiled), values: [] }
    : { query: compiled.sql, values: [...compiled.parameters] }
