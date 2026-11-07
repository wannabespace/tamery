import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

import type { AlterColumnTarget } from './shape'
import {
  alterColumnStatement,
  duckdbAlterColumnStatements,
} from './shape/alter-column'

export const alterColumnQuery = (target: AlterColumnTarget) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        db.executeQuery(alterColumnStatement(Dialect.ClickHouse, db, target)),
      duckdb: (db) =>
        db.transaction().execute(async (tx) => {
          for (const statement of duckdbAlterColumnStatements(tx, target)) {
            // Sequential by design: DuckDB takes one change per ALTER, in order.
            // oxlint-disable-next-line no-await-in-loop
            await tx.executeQuery(statement)
          }
        }),
      mongodb: unsupported('Column changes'),
      mssql: (db) =>
        db.executeQuery(alterColumnStatement(Dialect.MSSQL, db, target)),
      mysql: (db) =>
        db.executeQuery(alterColumnStatement(Dialect.MySQL, db, target)),
      oracle: (db) =>
        db.executeQuery(alterColumnStatement(Dialect.Oracle, db, target)),
      postgres: (db) =>
        db.executeQuery(alterColumnStatement(Dialect.Postgres, db, target)),
      sqlite: unsupported('Changing a column'),
    },
  })
