import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { mssqlQualified } from '~/core/queries/shared/sql-fragments'
import { createQuery } from '~/core/runtime/query'

import type { IndexTarget } from './shape'

export const renameIndexQuery = ({
  name,
  newName,
  schema,
  table,
}: IndexTarget & { newName: string }) =>
  createQuery({
    query: {
      clickhouse: unsupported('Renaming indexes'),
      mongodb: unsupported('Indexes'),
      mssql: (db) =>
        sql`EXEC sp_rename ${sql.val(mssqlQualified(schema, table, name))}, ${sql.val(newName)}, 'INDEX'`.execute(
          db
        ),
      mysql: (db) =>
        sql`ALTER TABLE ${sql.id(schema, table)} RENAME INDEX ${sql.id(name)} TO ${sql.id(newName)}`.execute(
          db
        ),
      oracle: (db) =>
        sql`ALTER INDEX ${sql.id(schema, name)} RENAME TO ${sql.id(newName)}`.execute(
          db
        ),
      postgres: (db) =>
        sql`ALTER INDEX ${sql.id(schema, name)} RENAME TO ${sql.id(newName)}`.execute(
          db
        ),
      sqlite: unsupported('Renaming indexes'),
    },
  })
