import type { NameCase } from './dialect'

export interface SqlColumn {
  name: string
  type: string
  nullable: boolean
  comment?: string | null
}

export const COLUMNS_NOT_LOADED = null

export interface SqlTable {
  name: string
  kind: string
  columns: SqlColumn[] | typeof COLUMNS_NOT_LOADED
  comment?: string | null
}

interface SqlSchema {
  name: string
  tables: SqlTable[]
}

interface SqlEnum {
  name: string
  values: string[]
  table?: string
  column?: string
}

export interface SqlCatalog {
  defaultSchema: string | null
  nameCase: NameCase | null
  schemas: SqlSchema[]
  enums: SqlEnum[]
}

const collator = new Intl.Collator(undefined, { sensitivity: 'accent' })

const namesMatch = (catalog: SqlCatalog, a: string, b: string) =>
  catalog.nameCase ? a === b : collator.compare(a, b) === 0

export const findSchema = (catalog: SqlCatalog, name: string) =>
  catalog.schemas.find((schema) => namesMatch(catalog, schema.name, name))

export const findTableWithSchema = (
  catalog: SqlCatalog,
  name: string,
  schema: string | null
) => {
  const schemas = schema
    ? [findSchema(catalog, schema)]
    : [
        ...(catalog.defaultSchema
          ? [findSchema(catalog, catalog.defaultSchema)]
          : []),
        ...catalog.schemas,
      ]
  for (const candidate of schemas) {
    const table = candidate?.tables.find((item) =>
      namesMatch(catalog, item.name, name)
    )
    if (candidate && table) {
      return { schema: candidate.name, table }
    }
  }
}

export const findTable = (
  catalog: SqlCatalog,
  name: string,
  schema: string | null
) => findTableWithSchema(catalog, name, schema)?.table

export const findColumn = (
  catalog: SqlCatalog,
  table: SqlTable,
  name: string
) => table.columns?.find((column) => namesMatch(catalog, column.name, name))

export const findEnum = (
  catalog: SqlCatalog,
  table: string,
  column: SqlColumn
) =>
  catalog.enums.find(
    (item) => item.table === table && item.column === column.name
  ) ??
  catalog.enums.find(
    (item) =>
      collator.compare(item.name, column.type) === 0 ||
      column.type.toLowerCase().endsWith(`.${item.name.toLowerCase()}`)
  )
