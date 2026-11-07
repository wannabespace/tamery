import type { Kysely } from 'kysely'

import {
  currentDatabase,
  duckdbCatalog,
} from '~/core/queries/shared/duckdb-catalog'
import type { Database as DuckdbDatabase } from '~/core/runtime/dialects/duckdb/schema'

/** `expressions` is a list printed as text: a plain column bare, anything else single-quoted. */
const LIST_ITEM = /'(?:[^']|'')*'|[^,[\]\s][^,\]]*/gu
const QUOTED_NAME = /^"(?<name>(?:[^"]|"")*)"$/u
const BARE_NAME = /^[\p{L}_][\p{L}\p{N}_$]*$/u

const keyParts = (expressions: string | null) =>
  Array.from(expressions?.matchAll(LIST_ITEM) ?? [], ([item]) => {
    const text = item.startsWith("'")
      ? item.slice(1, -1).replaceAll("''", "'")
      : item.trim()
    const quoted = QUOTED_NAME.exec(text)?.groups?.name
    if (quoted !== undefined) {
      return { column: quoted.replaceAll('""', '"'), expression: null }
    }
    return BARE_NAME.test(text)
      ? { column: text, expression: null }
      : { column: null, expression: text }
  })

/** Only indexes a CREATE INDEX made: DuckDB lists none for the keys that back a primary key or a unique constraint. */
export const duckdbIndexes = async (db: Kysely<DuckdbDatabase>) => {
  const rows = await db
    .selectFrom(duckdbCatalog('duckdb_indexes').as('i'))
    .select([
      'i.schema_name as schema',
      'i.table_name as table',
      'i.index_name as name',
      'i.is_unique',
      'i.expressions',
      'i.sql as index_definition',
    ])
    .where('i.database_name', '=', currentDatabase)
    .orderBy('i.schema_name')
    .orderBy('i.table_name')
    .orderBy('i.index_name')
    .execute()
  return rows.flatMap(({ expressions, ...row }) =>
    keyParts(expressions).map(({ column, expression }) => ({
      ...row,
      column,
      custom_expression: expression,
      is_custom: expression !== null,
      is_primary: false,
    }))
  )
}
