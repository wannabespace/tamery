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
  // DuckDB's SQL takes Postgres's quoting, `$1` parameters and RETURNING.
  duckdb: {
    createAdapter: () => new PostgresAdapter(),
    createIntrospector,
    createQueryCompiler: () => new PostgresQueryCompiler(),
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
  sqlite: {
    createAdapter: () => new SqliteAdapter(),
    createIntrospector,
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
} satisfies Record<SqlDialect, Omit<KyselyDialect, 'createDriver'>>

/** Each compiler's token for a bound value, `index` naming the value when the token numbers it. */
export const PARAMETER_PLACEHOLDERS = {
  clickhouse: /\?/u,
  duckdb: /\$(?<index>\d+)/u,
  mssql: /@(?<index>\d+)/u,
  mysql: /\?/u,
  oracle: /:(?<index>\d+)/u,
  postgres: /\$(?<index>\d+)/u,
  sqlite: /\?/u,
} satisfies Record<SqlDialect, RegExp>

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
  dialect === Dialect.ClickHouse
    ? { query: prepareQuery(compiled), values: [] }
    : { query: compiled.sql, values: [...compiled.parameters] }
