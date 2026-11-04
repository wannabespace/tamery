import { Dialect } from '@tamery/shared/enums/connection-type'
import { memoize } from 'memoza'

import { createQuery } from '~/core/runtime/query'

import { dropTableStatement } from './shape'

export const dropTableQuery = memoize(
  (target: { table: string; schema: string; cascade: boolean }) =>
    createQuery({
      query: {
        clickhouse: (db) =>
          db.executeQuery(dropTableStatement(Dialect.ClickHouse, db, target)),
        mongodb: (db) => db.collection(target.table).drop(),
        mssql: (db) =>
          db.executeQuery(dropTableStatement(Dialect.MSSQL, db, target)),
        mysql: (db) =>
          db.executeQuery(dropTableStatement(Dialect.MySQL, db, target)),
        oracle: (db) =>
          db.executeQuery(dropTableStatement(Dialect.Oracle, db, target)),
        postgres: (db) =>
          db.executeQuery(dropTableStatement(Dialect.Postgres, db, target)),
        sqlite: (db) =>
          db.executeQuery(dropTableStatement(Dialect.SQLite, db, target)),
      },
    })
)
