import { unsupported } from '@tamery/shared/unsupported'

import { plsqlUnit } from '~/core/queries/shared/plsql'
import { createQuery } from '~/core/runtime/query'

import type { FunctionShape } from './shape'
import { createFunctionStatements, routineType } from './shape'

export const createFunctionQuery = ({
  schema,
  shape,
}: {
  schema: string
  shape: FunctionShape
}) => {
  const create = createFunctionStatements({ replace: false, schema, shape })

  return createQuery({
    query: {
      clickhouse: unsupported('Functions'),
      mongodb: unsupported('Functions'),
      mssql: (db) => create.mssql.execute(db),
      mysql: (db) => create.mysql.execute(db),
      oracle: (db) =>
        plsqlUnit.save(db, {
          body: shape.body,
          create: (replace) =>
            createFunctionStatements({ replace, schema, shape }).oracle,
          original: null,
          unit: { name: shape.name, schema, type: routineType(shape.kind) },
        }),
      postgres: (db) => create.postgres.execute(db),
      sqlite: unsupported('Functions'),
    },
  })
}
