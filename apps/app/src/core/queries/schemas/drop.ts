import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

export const dropSchemaQuery = ({
  cascade,
  schema,
}: {
  cascade: boolean
  schema: string
}) =>
  createQuery({
    query: {
      clickhouse: unsupported('Schemas'),
      mongodb: unsupported('Schemas'),
      mssql: (db) => db.schema.dropSchema(schema).execute(),
      mysql: (db) => db.schema.dropSchema(schema).execute(),
      oracle: (db) =>
        (cascade
          ? sql`DROP USER ${sql.id(schema)} CASCADE`
          : sql`DROP USER ${sql.id(schema)}`
        ).execute(db),
      postgres: (db) => {
        const drop = db.schema.dropSchema(schema)
        return (cascade ? drop.cascade() : drop).execute()
      },
      sqlite: unsupported('Schemas'),
    },
  })
