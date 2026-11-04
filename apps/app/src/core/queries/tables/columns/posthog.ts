import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import type { ColumnsFilter } from '../shape'

interface PosthogColumn {
  column_name: string
  data_type: string
  description: string | null
  is_nullable: number
  table_name: string
  table_schema: string
}

const POSTHOG_CATALOG_LIMIT = 50_000

export const posthogColumns = async (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  filter: ColumnsFilter
) => {
  // A dotted name is a field nested under a virtual table, which `SELECT *` does not return on its own.
  const { rows } = await sql<PosthogColumn>`
    SELECT table_schema, table_name, column_name, data_type, is_nullable, description
    FROM system.information_schema.columns
    WHERE field_kind != 'virtual_table'
      AND NOT column_name LIKE '%.%'
      AND ${
        filter
          ? sql`table_schema = ${filter.schema} AND table_name = ${filter.table}`
          : sql`table_schema NOT IN ('system', 'information_schema')`
      }
    ORDER BY table_name, ordinal_position
    LIMIT ${sql.lit(POSTHOG_CATALOG_LIMIT)}
  `.execute(db)

  return rows.map((row) => ({
    comment: row.description,
    default: null,
    editable: false,
    id: row.column_name,
    nullable: row.is_nullable === 1,
    schema: row.table_schema,
    table: row.table_name,
    type: row.data_type,
  }))
}
