import { Dialect } from '@tamery/shared/enums/connection-type'
import { dialects, splitStatements } from '@tamery/sql'

import type { QueryExecuteResult, ResultSet, RunOptions } from '../..'
import { NO_ROW_COUNT, resultSet } from '../..'
import type { TxHandle } from '../../transactions'

export const SQLITE = dialects[Dialect.SQLite]

export type SqliteValue = bigint | number | string | Uint8Array | null

/**
 * `affectedRows` is the raw change count, `null` for a statement held until its transaction commits; `maxRows` lets a
 * transport stop reading early. `runTimed` drops both past their use.
 */
export type RunStatements = (
  texts: string[],
  values: SqliteValue[],
  maxRows: number
) => Promise<Omit<ResultSet, 'truncated'>[]>

export type SqliteTransaction = Pick<
  TxHandle,
  'commit' | 'release' | 'rollback' | 'status'
> & { run: RunStatements }

/** How a file, D1 or a libSQL server runs statements; everything else about SQLite is shared. */
export interface SqliteTransport {
  run: (
    connectionString: string,
    ...args: Parameters<RunStatements>
  ) => ReturnType<RunStatements>
  transaction: (
    connectionString: string,
    readOnly: boolean
  ) => Promise<SqliteTransaction>
  /** Only a transport that holds a connection between requests has one. */
  openSession?: (connectionString: string) => SqliteTransaction
}

const toInput = (value: unknown): SqliteValue => {
  if (typeof value === 'boolean') {
    return Number(value)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return (value ?? null) as SqliteValue
}

/** A blob arrives as an `ArrayBuffer` from libSQL and as a number array from D1. */
export const toOutput = (value: unknown) => {
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : String(value)
  }
  if (value instanceof ArrayBuffer || Array.isArray(value)) {
    return new Uint8Array(value)
  }
  return value
}

/** A driver prepares only the first statement of a text, so a text without bound values runs one statement at a time. */
export const statementTexts = (sql: string, values: unknown[]) =>
  values.length > 0
    ? [sql]
    : splitStatements(sql, SQLITE, { groupTransactions: false }).map(
        (statement) => statement.text
      )

export const runTimed = async (
  run: RunStatements,
  texts: string[],
  values: unknown[],
  { maxRows = Infinity }: RunOptions
): Promise<QueryExecuteResult> => {
  const start = performance.now()
  const results = await run(texts, values.map(toInput), maxRows)
  return {
    duration: performance.now() - start,
    result: results.map(({ affectedRows, columns, rows }) =>
      resultSet(
        {
          affectedRows: columns.length === 0 ? affectedRows : NO_ROW_COUNT,
          columns,
          rows,
        },
        maxRows
      )
    ),
  }
}
