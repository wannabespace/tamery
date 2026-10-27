import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { PolicyTarget } from './shape'
import { policyOn } from './shape'

export const dropPolicyQuery = (target: PolicyTarget) =>
  createQuery({
    query: {
      clickhouse: (db) => sql`DROP ROW POLICY ${policyOn(target)}`.execute(db),
      mongodb: unsupported('Row policies'),
      mssql: (db) =>
        sql`DROP SECURITY POLICY ${sql.id(target.schema, target.name)}`.execute(
          db
        ),
      mysql: unsupported('Row policies'),
      oracle: unsupported('Row policies'),
      postgres: (db) => sql`DROP POLICY ${policyOn(target)}`.execute(db),
      sqlite: unsupported('Row policies'),
    },
  })
