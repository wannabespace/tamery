import { parseInsertOne } from '@tamery/mongo/parse'
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
}) => {
  const statement = `db.getCollection(${JSON.stringify(table)}).insertOne(${document})`
  return createQuery({
    query: {
      clickhouse: unsupported(DOCUMENT),
      // The statement runs as a script, so a crafted document could chain extra calls; parseInsertOne refuses anything but this one insertOne.
      mongodb: (db) => {
        parseInsertOne(statement, table)
        return db.run(statement)
      },
      mssql: unsupported(DOCUMENT),
      mysql: unsupported(DOCUMENT),
      oracle: unsupported(DOCUMENT),
      postgres: unsupported(DOCUMENT),
      sqlite: unsupported(DOCUMENT),
    },
  })
}
