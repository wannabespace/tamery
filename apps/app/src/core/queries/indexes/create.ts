import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

import type { IndexShape } from './shape'
import {
  addSkipIndexStatement,
  createIndexStatement,
  materializeIndexStatement,
  oracleCreateIndexStatement,
  sqliteCreateIndexStatement,
} from './shape'

export const createIndexQuery = (shape: IndexShape) => {
  const create = createIndexStatement(shape)

  return createQuery({
    query: {
      clickhouse: async (db) => {
        await addSkipIndexStatement(shape).execute(db)
        await materializeIndexStatement(shape).execute(db)
      },
      mongodb: unsupported('Indexes'),
      mssql: (db) => create.execute(db),
      mysql: (db) => create.execute(db),
      oracle: (db) => oracleCreateIndexStatement(shape).execute(db),
      postgres: (db) => create.execute(db),
      sqlite: (db) => sqliteCreateIndexStatement(shape).execute(db),
    },
  })
}
