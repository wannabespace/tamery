import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

export const renameSchemaQuery = ({
  name,
  schema,
}: {
  name: string
  schema: string
}) =>
  createQuery({
    query: {
      clickhouse: unsupported('Renaming schemas'),
      mongodb: unsupported('Schemas'),
      mssql: unsupported('Renaming schemas'),
      mysql: unsupported('Renaming schemas'),
      oracle: unsupported('Renaming schemas'),
      postgres: (db) =>
        sql`ALTER SCHEMA ${sql.id(schema)} RENAME TO ${sql.id(name)}`.execute(
          db
        ),
      sqlite: unsupported('Renaming schemas'),
    },
  })
