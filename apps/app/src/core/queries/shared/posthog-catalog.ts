/** The catalog's `table_name` is the whole HogQL name (`system.dashboards`), and its `table_schema` only a label, so a qualified name's own first part is the schema the app shows and compiles. */
export const getPosthogTable = (tableSchema: string, tableName: string) => {
  const dot = tableName.indexOf('.')
  return dot === -1
    ? { schema: tableSchema, table: tableName }
    : { schema: tableName.slice(0, dot), table: tableName.slice(dot + 1) }
}
