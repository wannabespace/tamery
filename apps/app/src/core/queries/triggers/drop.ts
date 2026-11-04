import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

import type { TriggerTarget } from './shape'
import { dropTriggerStatements } from './shape'

export const dropTriggerQuery = (params: TriggerTarget & { name: string }) => {
  const drop = dropTriggerStatements(params)

  return createQuery({
    query: {
      clickhouse: unsupported('Triggers'),
      mongodb: unsupported('Triggers'),
      mssql: (db) => drop.mssql.execute(db),
      mysql: (db) => drop.mysql.execute(db),
      oracle: (db) => drop.oracle.execute(db),
      postgres: (db) => drop.postgres.execute(db),
      sqlite: (db) => drop.sqlite.execute(db),
    },
  })
}
