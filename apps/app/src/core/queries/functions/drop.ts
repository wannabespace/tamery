import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { RoutineTarget } from './shape'
import { dropRoutineStatements } from './shape'

export const dropFunctionQuery = ({
  cascade,
  ...target
}: RoutineTarget & { cascade: boolean }) => {
  const drop = dropRoutineStatements(target)

  return createQuery({
    query: {
      clickhouse: unsupported('Functions'),
      mongodb: unsupported('Functions'),
      mssql: (db) => drop.mssql.execute(db),
      mysql: (db) => drop.mysql.execute(db),
      oracle: (db) => drop.oracle.execute(db),
      postgres: (db) =>
        (cascade ? sql`${drop.postgres} CASCADE` : drop.postgres).execute(db),
      sqlite: unsupported('Functions'),
    },
  })
}
