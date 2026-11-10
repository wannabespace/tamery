import { sql } from 'kysely'

import type { CatalogFunctions } from '~/core/runtime/dialects/duckdb/schema'

export const duckdbCatalog = <Name extends keyof CatalogFunctions>(
  name: Name
) => sql<CatalogFunctions[Name]>`${sql.raw(name)}()`

/** A file's database is named after the file, so reads compare against this rather than the resource. */
export const currentDatabase = sql<string>`current_database()`
