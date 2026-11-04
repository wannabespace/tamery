import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import type { ConstraintShape } from '~/core/queries/constraints/shape'
import {
  addConstraint,
  constraintClause,
} from '~/core/queries/constraints/shape'
import { createQuery } from '~/core/runtime/query'

import type { NewColumn } from './shape'
import { addColumnStatement } from './shape'

export const addColumnQuery = ({
  reference,
  ...target
}: {
  column: NewColumn
  reference?: ConstraintShape
  schema: string
  table: string
}) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        db.executeQuery(addColumnStatement(Dialect.ClickHouse, db, target)),
      mongodb: unsupported('Column changes'),
      mssql: async (db) => {
        await db.executeQuery(addColumnStatement(Dialect.MSSQL, db, target))
        if (reference) {
          await addConstraint(db, target, reference).execute()
        }
      },
      // MySQL and Oracle commit each DDL statement, so the key goes in the
      // same ALTER: a key that fails leaves no column behind.
      mysql: (db) => {
        const { column, schema, table } = target
        return reference
          ? sql`ALTER TABLE ${sql.id(schema, table)} ADD COLUMN ${sql.id(column.name)} ${sql.raw(column.type)}${sql.raw(column.nullable ? '' : ' NOT NULL')}, ADD ${constraintClause(reference)}`.execute(
              db
            )
          : db.executeQuery(addColumnStatement(Dialect.MySQL, db, target))
      },
      oracle: (db) => {
        const { column, schema, table } = target
        return reference
          ? sql`ALTER TABLE ${sql.id(schema, table)} ADD (${sql.id(column.name)} ${sql.raw(column.type)}${sql.raw(column.nullable ? '' : ' NOT NULL')}, ${constraintClause(reference)})`.execute(
              db
            )
          : db.executeQuery(addColumnStatement(Dialect.Oracle, db, target))
      },
      postgres: async (db) => {
        await db.executeQuery(addColumnStatement(Dialect.Postgres, db, target))
        if (reference) {
          await addConstraint(db, target, reference).execute()
        }
      },
      sqlite: reference
        ? unsupported('Foreign keys on a stored table')
        : (db) =>
            db.executeQuery(addColumnStatement(Dialect.SQLite, db, target)),
    },
  })
