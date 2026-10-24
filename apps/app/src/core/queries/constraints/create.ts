import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

import type { ConstraintShape } from './shape'
import { addConstraint } from './shape'

export const createConstraintQuery = ({
  schema,
  shape,
  table,
}: {
  schema: string
  shape: ConstraintShape
  table: string
}) =>
  createQuery({
    query: {
      clickhouse: (db) => addConstraint(db, { schema, table }, shape).execute(),
      mongodb: unsupported('Constraints'),
      mssql: (db) => addConstraint(db, { schema, table }, shape).execute(),
      mysql: (db) => addConstraint(db, { schema, table }, shape).execute(),
      oracle: (db) => addConstraint(db, { schema, table }, shape).execute(),
      postgres: (db) => addConstraint(db, { schema, table }, shape).execute(),
      sqlite: unsupported('Adding constraints'),
    },
  })
