import { createQuery } from '~/core/runtime/query'

export const dropViewQuery = ({
  cascade,
  materialized,
  schema,
  view,
}: {
  cascade: boolean
  materialized: boolean
  schema: string
  view: string
}) =>
  createQuery({
    query: {
      clickhouse: (db) => db.withSchema(schema).schema.dropView(view).execute(),
      mongodb: (db) => db.collection(view).drop(),
      mssql: (db) => db.withSchema(schema).schema.dropView(view).execute(),
      mysql: (db) => db.withSchema(schema).schema.dropView(view).execute(),
      oracle: (db) => {
        const drop = db.withSchema(schema).schema.dropView(view)

        return (materialized ? drop.materialized() : drop).execute()
      },
      postgres: (db) => {
        const drop = db.withSchema(schema).schema.dropView(view)
        const kind = materialized ? drop.materialized() : drop

        return (cascade ? kind.cascade() : kind).execute()
      },
      sqlite: (db) => db.withSchema(schema).schema.dropView(view).execute(),
    },
  })
