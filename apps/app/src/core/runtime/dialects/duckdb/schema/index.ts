import type { WithSchema } from '~/core/connection/types'

export type Database = WithSchema<InformationSchema, 'information_schema'>

/** Each lists every attached database, so a read keeps to `current_database()`. */
interface InformationSchema {
  columns: {
    table_catalog: string
    table_schema: string
    table_name: string
    column_name: string
    ordinal_position: number
    column_default: string | null
    is_nullable: 'NO' | 'YES'
    data_type: string
    character_maximum_length: number | null
    numeric_precision: number | null
    numeric_scale: number | null
    is_generated: 'ALWAYS' | 'NEVER'
    COLUMN_COMMENT: string | null
  }
  schemata: {
    catalog_name: string
    schema_name: string
  }
  tables: {
    table_catalog: string
    table_schema: string
    table_name: string
    table_type: 'BASE TABLE' | 'LOCAL TEMPORARY' | 'VIEW'
    TABLE_COMMENT: string | null
  }
}

/** Read through `duckdbCatalog`: the bare names of some leave out everything DuckDB calls internal, its `main` schema among it. */
export interface CatalogFunctions {
  duckdb_constraints: {
    database_name: string
    schema_name: string
    table_name: string
    constraint_index: number
    constraint_type:
      | 'CHECK'
      | 'FOREIGN KEY'
      | 'NOT NULL'
      | 'PRIMARY KEY'
      | 'UNIQUE'
    constraint_text: string
    expression: string | null
    constraint_column_names: string[]
    constraint_name: string
    referenced_table: string | null
    referenced_column_names: string[]
  }
  duckdb_databases: {
    database_name: string
    internal: boolean
    type: string
  }
  duckdb_indexes: {
    database_name: string
    schema_name: string
    index_name: string
    table_name: string
    is_unique: boolean
    is_primary: boolean
    expressions: string | null
    sql: string | null
  }
}
