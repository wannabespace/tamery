import { unsupported } from '@tamery/shared/unsupported'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

export const alterEnumQuery = ({
  additions,
  name,
  newName,
  renames,
  schema,
}: {
  additions: string[]
  name: string
  newName: string
  renames: Record<string, string>
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
        db.transaction().execute(async (tx) => {
          const target = sql.id(schema, name)
          const statements = [
            ...Object.entries(renames).map(
              ([from, to]) =>
                sql`ALTER TYPE ${target} RENAME VALUE ${sql.lit(from)} TO ${sql.lit(to)}`
            ),
            ...additions.map(
              (value) => sql`ALTER TYPE ${target} ADD VALUE ${sql.lit(value)}`
            ),
          ]

          if (newName !== name) {
            statements.push(
              sql`ALTER TYPE ${target} RENAME TO ${sql.id(newName)}`
            )
          }

          for (const statement of statements) {
            // oxlint-disable-next-line no-await-in-loop
            await statement.execute(tx)
          }
        }),
      sqlite: unsupported('Editing enums'),
    },
  })
