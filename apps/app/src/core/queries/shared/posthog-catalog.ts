import { POSTHOG_SCHEMA_LABELS } from '@tamery/connection/queries/dialects/posthog/query-compiler'

/**
 * The catalog's `table_name` is the whole HogQL name (`system.dashboards`, `postgres.public.users`) and its `table_schema` only a
 * label, so what leads the name is the schema the app shows and compiles. `null` for a real namespace spelled like a label
 * (`public.orders`): the compiler drops those labels, so the grid would read another table.
 */
export const getPosthogTable = (tableSchema: string, tableName: string) => {
  const dot = tableName.lastIndexOf('.')
  if (dot === -1) {
    return { schema: tableSchema, table: tableName }
  }
  const schema = tableName.slice(0, dot)
  return POSTHOG_SCHEMA_LABELS.has(schema.split('.', 1)[0] ?? '')
    ? null
    : { schema, table: tableName.slice(dot + 1) }
}
