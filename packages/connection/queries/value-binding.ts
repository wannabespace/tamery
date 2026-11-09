import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import type { FilterSpelling } from '@tamery/shared/filters'
import { sql } from 'kysely'

export type ColumnTypes = { id: string; type?: string }[]

const clickhouseDateTimeType = /\bDateTime(?:64\((?<precision>\d))?/u

// Reads come back ISO (`date_time_output_format`), which a DateTime comparison or cast cannot parse.
export const clickhouseDateTime = (columnType: string, value: unknown) => {
  const dateTime =
    typeof value === 'string' && clickhouseDateTimeType.exec(columnType)
  return dateTime
    ? sql`parseDateTime64BestEffort(${value}, ${Number(dateTime.groups?.precision ?? 0)})`
    : value
}

export const SQLITE_BOOLEAN_TYPE = /^boolean$/iu

const getColumnType = (columns: ColumnTypes, column: string) =>
  columns.find(({ id }) => id === column)?.type ?? ''

const JSON_PATH_KEY = /^[A-Za-z_]\w*$/u

/** `$.a[0]."b c"`: the path every engine but Postgres takes, as a literal since Oracle and ClickHouse refuse a bound one. */
const jsonPathLiteral = (path: string[]) =>
  sql.lit(
    `$${path
      .map((key) => {
        if (/^\d+$/u.test(key)) {
          return `[${key}]`
        }
        return JSON_PATH_KEY.test(key) ? `.${key}` : `.${JSON.stringify(key)}`
      })
      .join('')}`
  )

const jsonValue: FilterSpelling['jsonText'] = (column, path) =>
  sql`json_value(${sql.id(column)}, ${jsonPathLiteral(path)})`

export const filterSpellings: Record<
  SqlDialect,
  (columns: ColumnTypes) => FilterSpelling
> = {
  clickhouse: (columns) => ({
    bind: (column, value) =>
      clickhouseDateTime(getColumnType(columns, column), value),
    // JSON_VALUE answers '' for a missing path, so an empty string reads as null there.
    jsonText: (column, path) =>
      sql`nullIf(JSON_VALUE(toJSONString(${sql.id(column)}), ${jsonPathLiteral(path)}), '')`,
  }),
  duckdb: () => ({
    jsonText: (column, path) =>
      sql`json_extract_string(cast(${sql.id(column)} as json), ${jsonPathLiteral(path)})`,
  }),
  mssql: () => ({ jsonText: jsonValue }),
  mysql: () => ({
    // json_unquote turns a JSON null into the text 'null'.
    jsonText: (column, path) => {
      const value = sql`json_extract(${sql.id(column)}, ${jsonPathLiteral(path)})`
      return sql`case when json_type(${value}) = 'NULL' then null else json_unquote(${value}) end`
    },
  }),
  oracle: () => ({ jsonText: jsonValue }),
  postgres: () => ({
    jsonText: (column, path) =>
      sql`${sql.id(column)} #>> array[${sql.join(path.map((key) => sql.val(key)))}]::text[]`,
  }),
  sqlite: (columns) => ({
    // SQLite stores a boolean as 1 or 0, so the filter's `true` text never equals it.
    bind: (column, value) =>
      (value === 'true' || value === 'false') &&
      SQLITE_BOOLEAN_TYPE.test(getColumnType(columns, column))
        ? Number(value === 'true')
        : value,
    // json_extract returns a number as a number and a boolean as 1 or 0, neither equal to the filter's text.
    jsonText: (column, path) => {
      const args = sql`${sql.id(column)}, ${jsonPathLiteral(path)}`
      return sql`case json_type(${args}) when 'true' then 'true' when 'false' then 'false' else cast(json_extract(${args}) as text) end`
    },
  }),
}
