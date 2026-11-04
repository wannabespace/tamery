import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { PolicyShape, PolicyTarget } from './shape'
import { createPolicyStatement, policyOn } from './shape'

export const recreatePolicyQuery = (
  target: PolicyTarget & { shape: PolicyShape }
) =>
  createQuery({
    query: {
      clickhouse: unsupported('Row policies'),
      mongodb: unsupported('Row policies'),
      mssql: unsupported('Row policies'),
      mysql: unsupported('Row policies'),
      oracle: unsupported('Row policies'),
      postgres: (db) =>
        db.transaction().execute(async (tx) => {
          await sql`DROP POLICY ${policyOn(target)}`.execute(tx)
          await createPolicyStatement(target).execute(tx)
        }),
      sqlite: unsupported('Row policies'),
    },
  })
