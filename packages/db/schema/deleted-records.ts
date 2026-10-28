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
