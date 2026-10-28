import { Dialect } from '@tamery/shared/enums/connection-type'
import { sql } from 'kysely'

import { identifiers } from '~/core/queries/shared/sql-fragments'

export const SKIP_INDEX_TYPES = ['minmax', 'set(0)', 'bloom_filter'] as const

export interface IndexShape {
  columns: string[]
  expireAfterSeconds?: number
  granularity?: number
  name: string
  schema: string
  skipType?: string
  sparse?: boolean
  table: string
  unique?: boolean
}

export interface IndexTarget {
  name: string
  schema: string
  table: string
}

export const createIndexStatement = ({
  columns,
  name,
  schema,
  table,
  unique,
}: IndexShape) =>
  sql`CREATE ${unique ? sql`UNIQUE INDEX` : sql`INDEX`} ${sql.id(name)} ON ${sql.id(schema, table)} (${identifiers(columns)})`

// SQLite qualifies the index, never the table it is on.
export const sqliteCreateIndexStatement = ({
  columns,
  name,
  schema,
  table,
  unique,
}: IndexShape) =>
  sql`CREATE ${unique ? sql`UNIQUE INDEX` : sql`INDEX`} ${sql.id(schema, name)} ON ${sql.id(table)} (${identifiers(columns)})`

// Oracle files an unqualified index under the session's schema, not the table's.
export const oracleCreateIndexStatement = ({
  columns,
  name,
  schema,
  table,
  unique,
}: IndexShape) =>
  sql`CREATE ${unique ? sql`UNIQUE INDEX` : sql`INDEX`} ${sql.id(schema, name)} ON ${sql.id(schema, table)} (${identifiers(columns)})`

export const addSkipIndexStatement = ({
  columns,
  granularity = 1,
  name,
  schema,
  skipType = SKIP_INDEX_TYPES[0],
  table,
}: IndexShape) =>
  sql`ALTER TABLE ${sql.id(schema, table)} ADD INDEX ${sql.id(name)} (${identifiers(columns)}) TYPE ${sql.raw(skipType)} GRANULARITY ${sql.lit(granularity)}`

/** The statement a new index shows in a review before it runs: ClickHouse's is its skip index, whose materialize runs after it. */
export const indexPreviewStatement = (dialect: Dialect, shape: IndexShape) => {
  switch (dialect) {
    case Dialect.ClickHouse: {
      return addSkipIndexStatement(shape)
    }
    case Dialect.Oracle: {
      return oracleCreateIndexStatement(shape)
    }
    case Dialect.SQLite: {
      return sqliteCreateIndexStatement(shape)
    }
    default: {
      return createIndexStatement(shape)
    }
  }
}

// ADD INDEX only covers parts written afterwards; this builds it for the rest.
export const materializeIndexStatement = ({
  name,
  schema,
  table,
}: IndexTarget) =>
  sql`ALTER TABLE ${sql.id(schema, table)} MATERIALIZE INDEX ${sql.id(name)}`

export const dropSkipIndexStatement = ({ name, schema, table }: IndexTarget) =>
  sql`ALTER TABLE ${sql.id(schema, table)} DROP INDEX ${sql.id(name)}`

const IDENTIFIER = /^(?:`(?<quoted>(?:[^`\\]|\\.)*)`|(?<plain>[A-Za-z_]\w*))$/u
const TUPLE = /^(?:tuple)?\((?<inner>.*)\)$/su

export const getSkipIndexColumns = (expression: string) => {
  const inner = TUPLE.exec(expression.trim())?.groups?.inner ?? expression
  const columns: string[] = []

  for (const part of inner.split(',')) {
    const groups = IDENTIFIER.exec(part.trim())?.groups
    const column =
      groups?.plain ?? groups?.quoted?.replaceAll(/\\(?<char>.)/gu, '$<char>')

    if (!column) {
      return null
    }
    columns.push(column)
  }

  return columns
}
