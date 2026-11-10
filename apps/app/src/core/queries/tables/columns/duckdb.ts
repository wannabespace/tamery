import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import {
  currentDatabase,
  duckdbCatalog,
} from '~/core/queries/shared/duckdb-catalog'
import type { Database as DuckdbDatabase } from '~/core/runtime/dialects/duckdb/schema'

import type { ColumnsFilter } from '../shape'

/** Not `information_schema.columns`: MotherDuck's endpoint renames its types to Postgres's (`ARRAY`, `text`). */
export const duckdbColumns = (
  db: Kysely<DuckdbDatabase>,
  filter: ColumnsFilter
) =>
  db
    .selectFrom(duckdbCatalog('duckdb_columns').as('c'))
    .select([
      'c.schema_name as schema',
      'c.table_name as table',
      'c.column_name as id',
      'c.column_default as default',
      'c.data_type as type',
      'c.character_maximum_length as maxLength',
      'c.numeric_precision as precision',
      'c.numeric_scale as scale',
      'c.comment',
      'c.is_nullable as nullable',
      // A union reads as its tag and value, which DuckDB casts back to no union. No `is_generated`: MotherDuck runs a
      // DuckDB older than the column.
      sql<boolean>`c.data_type NOT LIKE 'UNION(%'`.as('editable'),
    ])
    .where('c.database_name', '=', currentDatabase)
    .where('c.internal', '=', false)
    .$call((qb) =>
      filter
        ? qb
            .where('c.schema_name', '=', filter.schema)
            .where('c.table_name', '=', filter.table)
        : qb
    )
    .orderBy('c.schema_name')
    .orderBy('c.table_name')
    .orderBy('c.column_index')
    .execute()
