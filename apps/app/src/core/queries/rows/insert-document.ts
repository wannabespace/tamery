import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

const DOCUMENT = 'Insert document'

// The user's own text is evaluated as BSON by the executor's shell parser, so a typed literal like ObjectId("…") inserts as itself; binding it through the sampled columns would retype or drop fields the sample never saw.
export const insertDocumentQuery = ({
  document,
  table,
}: {
  document: string
  table: string
}) =>
  createQuery({
    query: {
      clickhouse: unsupported(DOCUMENT),
      mongodb: (db) =>
        db.run(
          `db.getCollection(${JSON.stringify(table)}).insertOne(${document})`
        ),
      mssql: unsupported(DOCUMENT),
      mysql: unsupported(DOCUMENT),
      oracle: unsupported(DOCUMENT),
      postgres: unsupported(DOCUMENT),
      sqlite: unsupported(DOCUMENT),
    },
  })
