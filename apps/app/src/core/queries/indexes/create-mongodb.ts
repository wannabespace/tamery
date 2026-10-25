import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

const INDEX = 'Indexes'

export interface MongoIndexShape {
  expireAfterSeconds?: number
  /** Each field mapped to its direction: 1 ascending, -1 descending. */
  keys: Record<string, number>
  name?: string
  sparse?: boolean
  table: string
  unique?: boolean
}

export const createMongoIndexQuery = ({
  expireAfterSeconds,
  keys,
  name,
  sparse,
  table,
  unique,
}: MongoIndexShape) =>
  createQuery({
    query: {
      clickhouse: unsupported(INDEX),
      mongodb: (db) =>
        db.collection(table).createIndex(keys, {
          ...(name && { name }),
          ...(unique && { unique: true }),
          ...(sparse && { sparse: true }),
          ...(expireAfterSeconds !== undefined && { expireAfterSeconds }),
        }),
      mssql: unsupported(INDEX),
      mysql: unsupported(INDEX),
      oracle: unsupported(INDEX),
      postgres: unsupported(INDEX),
      sqlite: unsupported(INDEX),
    },
  })
