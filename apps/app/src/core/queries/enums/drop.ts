import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

export const dropEnumQuery = ({
  cascade,
  name,
  schema,
}: {
  cascade: boolean
  name: string
  schema: string
}) =>
  createQuery({
    query: {
      clickhouse: unsupported('Editing enums'),
      mongodb: unsupported('Enums'),
      mssql: unsupported('Editing enums'),
      mysql: unsupported('Editing enums'),
      oracle: unsupported('Editing enums'),
      postgres: (db) =>
        db
          .withSchema(schema)
          .schema.dropType(name)
          .$call((qb) => (cascade ? qb.cascade() : qb))
          .execute(),
      sqlite: unsupported('Editing enums'),
    },
  })
