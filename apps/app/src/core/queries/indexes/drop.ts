import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { IndexTarget } from './shape'
import { dropSkipIndexStatement } from './shape'

export const dropIndexQuery = ({ name, schema, table }: IndexTarget) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        dropSkipIndexStatement({ name, schema, table }).execute(db),
      mongodb: (db) => db.collection(table).dropIndex(name),
      mssql: (db) =>
        sql`DROP INDEX ${sql.id(name)} ON ${sql.id(schema, table)}`.execute(db),
      mysql: (db) =>
        sql`ALTER TABLE ${sql.id(schema, table)} DROP INDEX ${sql.id(name)}`.execute(
          db
        ),
      oracle: (db) => sql`DROP INDEX ${sql.id(schema, name)}`.execute(db),
      postgres: (db) => sql`DROP INDEX ${sql.id(schema, name)}`.execute(db),
      sqlite: (db) => db.withSchema(schema).schema.dropIndex(name).execute(),
    },
  })
