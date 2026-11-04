import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { replaceWithSavedDdl } from '~/core/queries/shared/definition'
import { createQuery } from '~/core/runtime/query'

import type { ConstraintKind, ConstraintShape, ConstraintTarget } from './shape'
import {
  addConstraint,
  constraintClause,
  dropConstraint,
  mysqlDropKey,
} from './shape'

export const recreateConstraintQuery = ({
  kind,
  name,
  schema,
  shape,
  table,
}: ConstraintTarget & { kind: ConstraintKind; shape: ConstraintShape }) => {
  const target = { name, schema, table }

  return createQuery({
    query: {
      clickhouse: (db) =>
        sql`
          ALTER TABLE ${sql.id(schema, table)}
          DROP ${mysqlDropKey(kind, name)},
          ADD ${constraintClause(shape)}
        `.execute(db),
      mongodb: unsupported('Constraints'),
      mssql: (db) =>
        db.transaction().execute(async (tx) => {
          await dropConstraint(tx, target).execute()
          await addConstraint(tx, target, shape).execute()
        }),
      mysql: (db) =>
        sql`
          ALTER TABLE ${sql.id(schema, table)}
          DROP ${mysqlDropKey(kind, name)},
          ADD ${constraintClause(shape)}
        `.execute(db),
      oracle: (db) =>
        replaceWithSavedDdl(db, {
          create: () => addConstraint(db, target, shape).execute(),
          drop: () => dropConstraint(db, target).execute(),
          savedDdl: sql<string>`DBMS_METADATA.GET_DDL(${kind === 'foreignKey' ? 'REF_CONSTRAINT' : 'CONSTRAINT'}, ${name}, ${schema})`,
        }),
      postgres: (db) =>
        db.transaction().execute(async (tx) => {
          await dropConstraint(tx, target).execute()
          await addConstraint(tx, target, shape).execute()
        }),
      sqlite: unsupported('Editing constraints'),
    },
  })
}
