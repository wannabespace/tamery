import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { PolicyTarget } from './shape'

export const setRowLevelSecurityQuery = ({
  enabled,
  name,
  schema,
  table,
}: PolicyTarget & { enabled: boolean }) =>
  createQuery({
    query: {
      clickhouse: unsupported('Row level security'),
      mongodb: unsupported('Row policies'),
      mssql: (db) =>
        sql`ALTER SECURITY POLICY ${sql.id(schema, name)} WITH (STATE = ${sql.raw(enabled ? 'ON' : 'OFF')})`.execute(
          db
        ),
      mysql: unsupported('Row level security'),
      oracle: unsupported('Row level security'),
      postgres: (db) =>
        sql`ALTER TABLE ${sql.id(schema, table)} ${enabled ? sql`ENABLE` : sql`DISABLE`} ROW LEVEL SECURITY`.execute(
          db
        ),
      sqlite: unsupported('Row level security'),
    },
  })
