import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

import { dropColumnStatement } from './shape'

export const dropColumnQuery = (target: {
  column: string
  schema: string
  table: string
}) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        db.executeQuery(dropColumnStatement(Dialect.ClickHouse, db, target)),
      mongodb: unsupported('Column changes'),
      mssql: (db) =>
        db.executeQuery(dropColumnStatement(Dialect.MSSQL, db, target)),
      mysql: (db) =>
        db.executeQuery(dropColumnStatement(Dialect.MySQL, db, target)),
      oracle: (db) =>
        db.executeQuery(dropColumnStatement(Dialect.Oracle, db, target)),
      postgres: (db) =>
        db.executeQuery(dropColumnStatement(Dialect.Postgres, db, target)),
      sqlite: (db) =>
        db.executeQuery(dropColumnStatement(Dialect.SQLite, db, target)),
    },
  })
