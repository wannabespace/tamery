import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect } from '@tamery/shared/enums/connection-type'

import type { DialectSpec } from '../dialect'
import { clickhouse } from './clickhouse'
import { mssql } from './mssql'
import { mysql } from './mysql'
import { oracle } from './oracle'
import { postgres } from './postgres'
import { sqlite } from './sqlite'

export const dialects: Record<SqlDialect, DialectSpec> = {
  [Dialect.ClickHouse]: clickhouse,
  [Dialect.MSSQL]: mssql,
  [Dialect.MySQL]: mysql,
  [Dialect.Oracle]: oracle,
  [Dialect.Postgres]: postgres,
  [Dialect.SQLite]: sqlite,
}
