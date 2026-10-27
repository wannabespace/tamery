import { unsupported } from '@tamery/shared/unsupported'

import { plsqlUnit } from '~/core/queries/shared/plsql'
import { createQuery } from '~/core/runtime/query'

import type { TriggerShape, TriggerTarget } from './shape'
import { createTriggerStatements } from './shape'

export const createTriggerQuery = (
  params: TriggerTarget & { shape: TriggerShape }
) => {
  const create = createTriggerStatements(params)

  return createQuery({
    query: {
      clickhouse: unsupported('Triggers'),
      mongodb: unsupported('Triggers'),
      mssql: (db) => create.mssql.execute(db),
      mysql: (db) => create.mysql.execute(db),
      oracle: (db) =>
        plsqlUnit.save(db, {
          body: params.shape.body,
          create: (replace) =>
            createTriggerStatements({ ...params, replace }).oracle,
          original: null,
          unit: {
            name: params.shape.name,
            schema: params.schema,
            type: 'TRIGGER',
          },
        }),
      postgres: (db) => create.postgres.execute(db),
      sqlite: (db) => create.sqlite.execute(db),
    },
  })
}
