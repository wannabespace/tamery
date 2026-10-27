import { Dialect } from '@tamery/shared/enums/connection-type'

import { createQuery } from '~/core/runtime/query'

import type { NewColumn } from './shape'
import { createTableStatement } from './shape'

export const createTableQuery = (target: {
  columns: NewColumn[]
  schema: string
  table: string
}) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        db.executeQuery(createTableStatement(Dialect.ClickHouse, db, target)),
      mongodb: (db) => db.createCollection(target.table),
      mssql: (db) =>
        db.executeQuery(createTableStatement(Dialect.MSSQL, db, target)),
      mysql: (db) =>
        db.executeQuery(createTableStatement(Dialect.MySQL, db, target)),
      oracle: (db) =>
        db.executeQuery(createTableStatement(Dialect.Oracle, db, target)),
      postgres: (db) =>
        db.executeQuery(createTableStatement(Dialect.Postgres, db, target)),
      sqlite: (db) =>
        db.executeQuery(createTableStatement(Dialect.SQLite, db, target)),
    },
  })
