import { POSTHOG_SCHEMA_LABELS } from '@tamery/connection/queries/dialects/posthog/query-compiler'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import { getPosthogTable } from '../../shared/posthog-catalog'
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
          ? sql`table_name = ${POSTHOG_SCHEMA_LABELS.has(filter.schema) ? filter.table : `${filter.schema}.${filter.table}`}`
          : sql`table_schema != 'information_schema'`
      }
    ORDER BY table_name, ordinal_position
    LIMIT ${sql.lit(POSTHOG_CATALOG_LIMIT)}
  `.execute(db)

  return rows.flatMap((row) => {
    const table = getPosthogTable(row.table_schema, row.table_name)
    return table
      ? [
          {
            comment: row.description,
            default: null,
            editable: false,
            id: row.column_name,
            nullable: row.is_nullable === 1,
            ...table,
            type: row.data_type,
          },
        ]
      : []
  })
}
