import { eq, getTableName, sql } from 'drizzle-orm'
import * as d from 'drizzle-orm/pg-core'

// Filled only by the `keep_deleted_record` trigger (see its migration), never by app code.
// Keep this file free of imports reaching `../env`: the purge cron runs with DATABASE_URL alone.
export const deletedRecords = d.snakeCase.table(
  'deleted_records',
  {
    data: d.jsonb().notNull(),
    deletedAt: d.timestamp({ withTimezone: true }).defaultNow().notNull(),
    recordId: d.uuid().notNull(),
    tableName: d.text().notNull(),
  },
  (t) => [
    d.primaryKey({ columns: [t.tableName, t.recordId] }),
    d.index().on(t.deletedAt),
  ]
)

// A copy holds each column's raw driver value (ciphertext stays encrypted) under its database name.
export const copies = {
  column: (column: d.PgColumn) =>
    sql<string>`(${deletedRecords.data} ->> ${column.name})`,
  of: (table: d.PgTable) => eq(deletedRecords.tableName, getTableName(table)),
  replace: (column: d.PgColumn, value: string) =>
    sql`jsonb_set(${deletedRecords.data}, ${`{${column.name}}`}::text[], to_jsonb(${value}::text))`,
}
