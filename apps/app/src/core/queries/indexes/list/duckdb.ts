import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import {
  currentDatabase,
  duckdbCatalog,
} from '~/core/queries/shared/duckdb-catalog'
import type { Database as DuckdbDatabase } from '~/core/runtime/dialects/duckdb/schema'

const QUOTED_NAME = /^"(?<name>(?:[^"]|"")*)"$/u
const BARE_NAME = /^[\p{L}_][\p{L}\p{N}_$]*$/u

/** Each key is a column, quoted only where its name needs it, or an expression's own text. */
const keyPart = (key: string) => {
  const quoted = QUOTED_NAME.exec(key)?.groups?.name
  if (quoted !== undefined) {
    return { column: quoted.replaceAll('""', '"'), expression: null }
  }
  return BARE_NAME.test(key)
    ? { column: key, expression: null }
    : { column: null, expression: key }
}

/** Only indexes a CREATE INDEX made: DuckDB lists none for the keys that back a primary key or a unique constraint. */
export const duckdbIndexes = async (db: Kysely<DuckdbDatabase>) => {
  const rows = await db
    .selectFrom(duckdbCatalog('duckdb_indexes').as('i'))
    .select([
      'i.schema_name as schema',
      'i.table_name as table',
      'i.index_name as name',
      'i.is_unique',
      // Stored as a list printed to text; the cast reads DuckDB's own escaping back.
      sql<string[]>`CAST(i.expressions AS VARCHAR[])`.as('expressions'),
      'i.sql as index_definition',
    ])
    .where('i.database_name', '=', currentDatabase)
    .orderBy('i.schema_name')
    .orderBy('i.table_name')
    .orderBy('i.index_name')
    .execute()
  return rows.flatMap(({ expressions, ...row }) =>
    expressions.map(keyPart).map(({ column, expression }) => ({
      ...row,
      column,
      custom_expression: expression,
      is_custom: expression !== null,
      is_primary: false,
    }))
  )
}
