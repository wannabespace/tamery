import type { AnyFunction } from '@tamery/shared/utils'
import { handleAggregateError, uppercaseFirst } from '@tamery/shared/utils'

export interface QueryExecuteResult {
  result: ResultSet[]
  duration: number
}

// Wire value: released machines (cli-v0.99.4) and the proxy send `null`, so it stays `null`.
export const NO_ROW_COUNT = null

export interface ResultSet {
  columns: string[]
  rows: unknown[][]
  /** Rows a write changed. */
  affectedRows: number | typeof NO_ROW_COUNT
  truncated: boolean
}

export interface RunOptions {
  queryId?: string
  maxRows?: number
}

/** Callers keep one row past `maxRows`, which is how it tells the set was truncated. */
export const resultSet = (
  { affectedRows, columns, rows }: Omit<ResultSet, 'truncated'>,
  maxRows: number
): ResultSet => ({
  affectedRows,
  columns,
  rows: rows.slice(0, maxRows),
  truncated: rows.length > maxRows,
})

export const rowObjects = ([first]: ResultSet[]) =>
  first
    ? first.rows.map((row) =>
        Object.fromEntries(first.columns.map((column, i) => [column, row[i]]))
      )
    : []

/** Kysely's `TransactionSettings`, lowercase as Kysely validates them. Interpolated into the opener. */
export interface TransactionSettings {
  accessMode?: string
  isolationLevel?: string
}

/** `failed`: the transaction is open but refuses everything except a rollback (Postgres after an error, SQL Server's uncommittable state). */
export type TransactionStatus = 'ended' | 'failed' | 'open'

export interface QueryExecutor {
  execute: (
    args: {
      connectionString: string
      query: string
      values?: unknown[]
    } & RunOptions
  ) => Promise<QueryExecuteResult>
  beginTransaction: (
    args: {
      connectionString: string
      ownerId?: string
    } & TransactionSettings
  ) => Promise<{ txId: string }>
  /** A connection of its own, driven through the transaction calls but opening nothing: the SQL run in it begins and ends its transaction verbatim. */
  openSession: (args: {
    connectionString: string
    ownerId?: string
  }) => Promise<{ txId: string }>
  executeTransaction: (
    args: {
      txId: string
      query: string
      values: unknown[]
      ownerId?: string
    } & RunOptions
  ) => Promise<QueryExecuteResult>
  /** Asks the database for the session's transaction state; one that ended (a COMMIT, an implicit commit, a server-side abort) releases the session. */
  transactionStatus: (args: {
    txId: string
    ownerId?: string
  }) => Promise<TransactionStatus>
  commitTransaction: (args: { txId: string; ownerId?: string }) => Promise<void>
  rollbackTransaction: (args: {
    txId: string
    ownerId?: string
  }) => Promise<void>
  cancel: (args: { connectionString: string; queryId: string }) => Promise<void>
}

export const replaceErrorPrefix = (message: string) =>
  message.toLowerCase().startsWith('error: ') ? message.slice(7) : message

export const handleQueryError = <T extends AnyFunction>(fn: T): T =>
  (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    try {
      return await handleAggregateError(fn)(...args)
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }

      throw new Error(uppercaseFirst(replaceErrorPrefix(error.message)), {
        cause: error,
      })
    }
  }) as T
