import { unsupported } from '@tamery/shared/unsupported'

import { createQuery } from '~/core/runtime/query'

export const createEnumQuery = ({
  name,
  schema,
  values,
}: {
  name: string
  schema: string
  values: string[]
}) =>
  createQuery({
    query: {
      clickhouse: unsupported('Editing enums'),
      mongodb: unsupported('Enums'),
      mssql: unsupported('Editing enums'),
      mysql: unsupported('Editing enums'),
      oracle: unsupported('Editing enums'),
      postgres: (db) =>
        db.withSchema(schema).schema.createType(name).asEnum(values).execute(),
      posthog: unsupported('Editing enums'),
      sqlite: unsupported('Editing enums'),
    },
  })
