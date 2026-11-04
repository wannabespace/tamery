import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

import type { TriggerTarget } from './shape'
import { setTriggerEnabledStatements } from './shape'

export const setTriggerEnabledQuery = (
  params: TriggerTarget & { enabled: boolean; mode: string; name: string }
) => {
  const setEnabled = setTriggerEnabledStatements(params)

  return createQuery({
    query: {
      clickhouse: unsupported('Disabling triggers'),
      mongodb: unsupported('Triggers'),
      mssql: (db) => setEnabled.mssql.execute(db),
      mysql: unsupported('Disabling triggers'),
      oracle: (db) => setEnabled.oracle.execute(db),
      postgres: (db) => setEnabled.postgres.execute(db),
      sqlite: unsupported('Disabling triggers'),
    },
  })
}
