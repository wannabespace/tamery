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
      mongodb: (db) =>
        db
          .collection(shape.table)
          .createIndex(
            Object.fromEntries(shape.columns.map((column) => [column, 1])),
            {
              ...(shape.name && { name: shape.name }),
              ...(shape.unique && { unique: true }),
              ...(shape.sparse && { sparse: true }),
              ...(shape.expireAfterSeconds !== undefined && {
                expireAfterSeconds: shape.expireAfterSeconds,
              }),
            }
          ),
      mssql: (db) => create.execute(db),
      mysql: (db) => create.execute(db),
      oracle: (db) => oracleCreateIndexStatement(shape).execute(db),
      postgres: (db) => create.execute(db),
      sqlite: (db) => sqliteCreateIndexStatement(shape).execute(db),
    },
  })
}
