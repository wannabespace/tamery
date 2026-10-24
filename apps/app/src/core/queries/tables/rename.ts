import { Dialect } from '@tamery/shared/enums/connection-type'
import { memoize } from 'memoza'

import { createQuery } from '~/core/runtime/query'

import { renameTableStatement } from './shape'

export const renameTableQuery = memoize(
  ({
    schema,
    oldTable,
    newTable,
  }: {
    schema: string
    oldTable: string
    newTable: string
  }) => {
    const target = { newName: newTable, schema, table: oldTable }

    return createQuery({
      query: {
        clickhouse: (db) =>
          db.executeQuery(renameTableStatement(Dialect.ClickHouse, db, target)),
        mongodb: (db) => db.collection(oldTable).rename(newTable),
        mssql: (db) =>
          db.executeQuery(renameTableStatement(Dialect.MSSQL, db, target)),
        mysql: (db) =>
          db.executeQuery(renameTableStatement(Dialect.MySQL, db, target)),
        oracle: (db) =>
          db.executeQuery(renameTableStatement(Dialect.Oracle, db, target)),
        postgres: (db) =>
          db.executeQuery(renameTableStatement(Dialect.Postgres, db, target)),
        sqlite: (db) =>
          db.executeQuery(renameTableStatement(Dialect.SQLite, db, target)),
      },
    })
  }
)
