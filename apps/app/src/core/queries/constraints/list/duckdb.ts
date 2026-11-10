import type { Kysely } from 'kysely'

import {
  currentDatabase,
  duckdbCatalog,
} from '~/core/queries/shared/duckdb-catalog'
import type { Database as DuckdbDatabase } from '~/core/runtime/dialects/duckdb/schema'

/** One row per key column, in key order, as the definitions rebuild a constraint from; a check naming no column still lists. */
export const duckdbConstraints = async (db: Kysely<DuckdbDatabase>) => {
  const rows = await db
    .selectFrom(duckdbCatalog('duckdb_constraints').as('c'))
    .select([
      'c.schema_name as schema',
      'c.table_name as table',
      'c.constraint_name as name',
      'c.constraint_type as type',
      'c.constraint_text as definition',
      'c.expression',
      'c.constraint_column_names as columns',
      'c.referenced_table',
      'c.referenced_column_names as referencedColumns',
    ])
    .$narrowType<{ type: 'CHECK' | 'FOREIGN KEY' | 'PRIMARY KEY' | 'UNIQUE' }>()
    .where('c.database_name', '=', currentDatabase)
    .where('c.constraint_type', '!=', 'NOT NULL')
    .orderBy('c.schema_name')
    .orderBy('c.table_name')
    .orderBy('c.constraint_index')
    .execute()
  return rows.flatMap(
    ({ columns, referenced_table, referencedColumns, ...row }) =>
      (columns.length > 0 ? columns : [null]).map((column, index) => ({
        ...row,
        column,
        foreign_column: referencedColumns[index] ?? null,
        foreign_schema: referenced_table ? row.schema : null,
        foreign_table: referenced_table,
        onDelete: null,
        onUpdate: null,
      }))
  )
}
