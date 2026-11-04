import type { Dialect } from '@tamery/shared/enums/connection-type'

import type { QueryExecutor } from '.'
import * as clickhouse from './dialects/clickhouse'
import * as mongodb from './dialects/mongodb'
import * as mssql from './dialects/mssql'
import * as mysql from './dialects/mysql'
import * as oracle from './dialects/oracle'
import * as pg from './dialects/pg'
import * as sqlite from './dialects/sqlite'

export const executors: Record<Dialect, QueryExecutor> = {
  clickhouse: clickhouse.query,
  mongodb: mongodb.query,
  mssql: mssql.query,
  mysql: mysql.query,
  oracle: oracle.query,
  postgres: pg.query,
  sqlite: sqlite.query,
}
