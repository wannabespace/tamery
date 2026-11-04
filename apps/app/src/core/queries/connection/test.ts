import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

export const testConnectionQuery = createQuery({
  query: {
    clickhouse: (db) => db.executeQuery(sql`SELECT 1`.compile(db)),
    mongodb: (db) => db.command('ping'),
    mssql: (db) => db.executeQuery(sql`SELECT 1`.compile(db)),
    mysql: (db) => db.executeQuery(sql`SELECT 1`.compile(db)),
    oracle: (db) => db.executeQuery(sql`SELECT 1 FROM DUAL`.compile(db)),
    postgres: (db) => db.executeQuery(sql`SELECT 1`.compile(db)),
    sqlite: (db) => db.executeQuery(sql`SELECT 1`.compile(db)),
  },
})
