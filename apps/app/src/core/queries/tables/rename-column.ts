import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'
import { memoize } from 'memoza'

import { createQuery } from '~/core/runtime/query'

import { renameColumnStatement } from './shape'

export const renameColumnQuery = memoize(
  ({
    schema,
    table,
    oldColumn,
    newColumn,
  }: {
    schema: string
    table: string
    oldColumn: string
    newColumn: string
  }) => {
    const target = { column: oldColumn, newName: newColumn, schema, table }

    return createQuery({
      query: {
        clickhouse: (db) =>
          db.executeQuery(
            renameColumnStatement(Dialect.ClickHouse, db, target)
          ),
        mongodb: unsupported('Column changes'),
        mssql: (db) =>
          db.executeQuery(renameColumnStatement(Dialect.MSSQL, db, target)),
        mysql: (db) =>
          db.executeQuery(renameColumnStatement(Dialect.MySQL, db, target)),
        oracle: (db) =>
          db.executeQuery(renameColumnStatement(Dialect.Oracle, db, target)),
        postgres: (db) =>
          db.executeQuery(renameColumnStatement(Dialect.Postgres, db, target)),
        sqlite: (db) =>
          db.executeQuery(renameColumnStatement(Dialect.SQLite, db, target)),
      },
    })
  }
)
