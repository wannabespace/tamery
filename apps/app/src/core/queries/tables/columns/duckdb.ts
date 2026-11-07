import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import { currentDatabase } from '~/core/queries/shared/duckdb-catalog'
import type { Database as DuckdbDatabase } from '~/core/runtime/dialects/duckdb/schema'

import type { ColumnsFilter } from '../shape'

export const duckdbColumns = (
  db: Kysely<DuckdbDatabase>,
  filter: ColumnsFilter
) =>
  db
    .selectFrom('information_schema.columns')
    .select([
      'table_schema as schema',
      'table_name as table',
      'column_name as id',
      'column_default as default',
      'data_type as type',
      'character_maximum_length as maxLength',
      'numeric_precision as precision',
      'numeric_scale as scale',
      'COLUMN_COMMENT as comment',
      sql<boolean>`is_nullable = 'YES'`.as('nullable'),
      sql<boolean>`is_generated = 'ALWAYS'`.as('isGenerated'),
      // A union reads as its tag and value, which DuckDB casts back to no union.
      sql<boolean>`is_generated <> 'ALWAYS' AND data_type NOT LIKE 'UNION(%'`.as(
        'editable'
      ),
    ])
    .where('table_catalog', '=', currentDatabase)
    .$call((qb) =>
      filter
        ? qb
            .where('table_schema', '=', filter.schema)
            .where('table_name', '=', filter.table)
        : qb
    )
    .orderBy('table_schema')
    .orderBy('table_name')
    .orderBy('ordinal_position')
    .execute()
