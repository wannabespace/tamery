import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

// The schema's first table is created right after, in another user's schema, and opened in a tab.
const ORACLE_SCHEMA_PRIVILEGES = [
  'CREATE USER',
  'CREATE ANY TABLE',
  'CREATE ANY INDEX',
  'CREATE ANY SEQUENCE',
  'SELECT ANY SEQUENCE',
  'SELECT ANY TABLE',
]

export const createSchemaQuery = (schema: string) =>
  createQuery({
    query: {
      clickhouse: unsupported('Schemas'),
      mongodb: unsupported('Schemas'),
      mssql: (db) => db.schema.createSchema(schema).execute(),
      mysql: (db) => db.schema.createSchema(schema).execute(),
      // NO AUTHENTICATION is 18c and up, so a schema-only user is a locked account with a
      // password nobody knows. Without a quota on the default tablespace, its tables are
      // created but refuse every row.
      oracle: async (db) => {
        const held = await db
          .selectFrom('SESSION_PRIVS')
          .select('PRIVILEGE as privilege')
          .where('PRIVILEGE', 'in', ORACLE_SCHEMA_PRIVILEGES)
          .execute()
        const missing = ORACLE_SCHEMA_PRIVILEGES.filter(
          (privilege) => !held.some((row) => row.privilege === privilege)
        )
        if (missing.length > 0) {
          throw new Error(
            `A new schema needs these privileges: ${missing.join(', ')}. Connect as a DBA, or ask one to grant them.`
          )
        }
        const { tablespace } = await db
          .selectFrom('DATABASE_PROPERTIES')
          .select('PROPERTY_VALUE as tablespace')
          .where('PROPERTY_NAME', '=', 'DEFAULT_PERMANENT_TABLESPACE')
          .executeTakeFirstOrThrow()
        const password = crypto.randomUUID().replaceAll('-', '').slice(0, 30)
        await sql`CREATE USER ${sql.id(schema)} IDENTIFIED BY ${sql.id(password)} ACCOUNT LOCK QUOTA UNLIMITED ON ${sql.id(tablespace)}`.execute(
          db
        )
      },
      postgres: (db) => db.schema.createSchema(schema).execute(),
      sqlite: unsupported('Schemas'),
    },
  })
