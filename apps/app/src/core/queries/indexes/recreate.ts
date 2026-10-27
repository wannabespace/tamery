import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { replaceWithSavedDdl } from '~/core/queries/shared/definition'
import { identifiers } from '~/core/queries/shared/sql-fragments'
import { createQuery } from '~/core/runtime/query'

import type { IndexShape } from './shape'
import {
  addSkipIndexStatement,
  createIndexStatement,
  dropSkipIndexStatement,
  materializeIndexStatement,
  oracleCreateIndexStatement,
  sqliteCreateIndexStatement,
} from './shape'

export const recreateIndexQuery = ({
  name,
  newName,
  ...shape
}: IndexShape & { newName: string }) => {
  const { columns, schema, table, unique } = shape
  const replacement = { ...shape, name: newName }
  const create = createIndexStatement(replacement)

  return createQuery({
    query: {
      clickhouse: async (db) => {
        await dropSkipIndexStatement({ name, schema, table }).execute(db)
        await addSkipIndexStatement(replacement).execute(db)
        await materializeIndexStatement(replacement).execute(db)
      },
      mongodb: unsupported('Indexes'),
      mssql: (db) =>
        db.transaction().execute(async (tx) => {
          await sql`DROP INDEX ${sql.id(name)} ON ${sql.id(schema, table)}`.execute(
            tx
          )
          await create.execute(tx)
        }),
      mysql: (db) =>
        sql`
          ALTER TABLE ${sql.id(schema, table)}
          DROP INDEX ${sql.id(name)},
          ADD ${unique ? sql`UNIQUE INDEX` : sql`INDEX`} ${sql.id(newName)} (${identifiers(columns)})
        `.execute(db),
      oracle: (db) =>
        replaceWithSavedDdl(db, {
          create: () => oracleCreateIndexStatement(replacement).execute(db),
          drop: () => sql`DROP INDEX ${sql.id(schema, name)}`.execute(db),
          savedDdl: sql<string>`DBMS_METADATA.GET_DDL('INDEX', ${name}, ${schema})`,
        }),
      postgres: (db) =>
        db.transaction().execute(async (tx) => {
          await sql`DROP INDEX ${sql.id(schema, name)}`.execute(tx)
          await create.execute(tx)
        }),
      sqlite: (db) =>
        db.transaction().execute(async (tx) => {
          await tx.withSchema(schema).schema.dropIndex(name).execute()
          await sqliteCreateIndexStatement(replacement).execute(tx)
        }),
    },
  })
}
