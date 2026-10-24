import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

import type { ConstraintKind, ConstraintTarget } from './shape'
import { dropConstraintStatement } from './shape'

export const dropConstraintQuery = (
  target: ConstraintTarget & { cascade: boolean; kind: ConstraintKind }
) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        db.executeQuery(
          dropConstraintStatement(Dialect.ClickHouse, db, target)
        ),
      mongodb: unsupported('Constraints'),
      mssql: (db) =>
        db.executeQuery(dropConstraintStatement(Dialect.MSSQL, db, target)),
      mysql: (db) =>
        db.executeQuery(dropConstraintStatement(Dialect.MySQL, db, target)),
      oracle: (db) =>
        db.executeQuery(dropConstraintStatement(Dialect.Oracle, db, target)),
      postgres: (db) =>
        db.executeQuery(dropConstraintStatement(Dialect.Postgres, db, target)),
      sqlite: unsupported('Dropping constraints'),
    },
  })
