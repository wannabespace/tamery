import { kyselyDialects } from '@tamery/connection/queries/kysely'
import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect } from '@tamery/shared/enums/connection-type'
import type { AnyFunction } from '@tamery/shared/utils'
import { Kysely } from 'kysely'
import { memoize } from 'memoza'

import type { Database as ClickhouseDatabase } from './clickhouse/schema'
import { createKyselyDriver } from './driver'
import type { Database as DuckdbDatabase } from './duckdb/schema'
import { mongodbDialect } from './mongodb'
import type { Database as MssqlDatabase } from './mssql/schema'
import type { Database as MysqlDatabase } from './mysql/schema'
import type { Database as OracleDatabase } from './oracle/schema'
import type { Database as PostgresDatabase } from './postgres/schema'
import type { Database as SqliteDatabase } from './sqlite/schema'
import type { DialectOptions } from './transport'

const createDialect = <Database>(dialect: SqlDialect) =>
  memoize(
    (options: DialectOptions) =>
      new Kysely<Database>({
        dialect: {
          ...kyselyDialects[dialect],
          createDriver: () => createKyselyDriver(dialect, options),
        },
      }),
    { cacheKey: ({ log: _log, ...rest }) => rest }
  )

export const dialects = {
  clickhouse: createDialect<ClickhouseDatabase>(Dialect.ClickHouse),
  duckdb: createDialect<DuckdbDatabase>(Dialect.DuckDB),
  mongodb: mongodbDialect,
  mssql: createDialect<MssqlDatabase>(Dialect.MSSQL),
  mysql: createDialect<MysqlDatabase>(Dialect.MySQL),
  oracle: createDialect<OracleDatabase>(Dialect.Oracle),
  postgres: createDialect<PostgresDatabase>(Dialect.Postgres),
  sqlite: createDialect<SqliteDatabase>(Dialect.SQLite),
} satisfies Record<Dialect, AnyFunction>
