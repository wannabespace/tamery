import type {
  DuckDBConnection,
  DuckDBResult,
  DuckDBValue,
  DuckDBValueConverter,
  Json,
} from '@duckdb/node-api'
import {
  endsTransaction,
  leavesTransactionOpen,
  splitStatements,
} from '@tamery/sql'
import { memoize } from 'memoza'

import type { ResultSet, RunOptions, TransactionStatus } from '../..'
import { resultSet } from '../..'
import { cancellable } from '../../cancellation'
import type { TxHandle } from '../../transactions'
import { loadDuckdb } from './driver'
import { connectTo } from './instances'
import type { DuckdbTransport } from './run'
import { DUCKDB } from './run'

/** The JSON converter, but a map reads as an object, which casts back through JSON, and an interval as DuckDB's own text, which a cell writes back as is. */
const getConverter = memoize((): DuckDBValueConverter<Json> => {
  const { DuckDBTypeId, JsonDuckDBValueConverter, objectArrayFromMapValue } =
    loadDuckdb()
  const convert: DuckDBValueConverter<Json> = (value, type, converter) => {
    if (value === null) {
      return null
    }
    if (type.typeId === DuckDBTypeId.INTERVAL) {
      return String(value)
    }
    if (type.typeId === DuckDBTypeId.MAP) {
      return Object.fromEntries(
        objectArrayFromMapValue(value, type, converter).map((entry) => [
          String(entry.key),
          entry.value,
        ])
      )
    }
    return JsonDuckDBValueConverter(value, type, converter)
  }
  return convert
})

const toInput = (value: unknown): DuckDBValue => {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value instanceof Uint8Array) {
    return loadDuckdb().blobValue(value)
  }
  return (value ?? null) as DuckDBValue
}

/** A RETURNING write makes all its changes before its first row, so stopping past `maxRows` leaves nothing half done. */
const readSet = async (
  result: DuckDBResult,
  maxRows: number
): Promise<Omit<ResultSet, 'truncated'>> => {
  const { ResultReturnType } = loadDuckdb()
  try {
    if (result.returnType !== ResultReturnType.QUERY_RESULT) {
      return {
        affectedRows:
          result.returnType === ResultReturnType.CHANGED_ROWS
            ? result.rowsChanged
            : null,
        columns: [],
        rows: [],
      }
    }
    // A JSON column reads as text, and its type reaches the converter without the alias that says so.
    const json = result.columnTypes().map((type) => type.alias === 'JSON')
    const rows: unknown[][] = []
    for await (const chunk of result.yieldConvertedRows(getConverter())) {
      rows.push(
        ...chunk.map((row) =>
          row.map((value, index) =>
            json[index] && value !== null ? JSON.parse(String(value)) : value
          )
        )
      )
      if (rows.length > maxRows) {
        break
      }
    }
    return { affectedRows: null, columns: result.columnNames(), rows }
  } finally {
    // A result left unread blocks its connection's next statement.
    result.closeSync()
  }
}

/** The driver binds values to one statement, so a text without them runs one statement at a time. */
const statementTexts = (sql: string, values: unknown[]) =>
  values.length > 0
    ? [sql]
    : splitStatements(sql, DUCKDB, { groupTransactions: false }).map(
        (statement) => statement.text
      )

const runOn = async (
  connection: DuckDBConnection,
  {
    connectionString,
    maxRows = Infinity,
    queryId,
    sql,
    values,
  }: { connectionString: string; sql: string; values: unknown[] } & RunOptions,
  onStatement?: (text: string, failed: boolean) => void
) => {
  const start = performance.now()
  const inputs = values.map(toInput)
  const sets = await cancellable(
    {
      cancel: () => Promise.resolve(connection.interrupt()),
      connectionString,
      queryId,
    },
    () =>
      Array.fromAsync(statementTexts(sql, values), async (text) => {
        try {
          const set = await readSet(
            await connection.stream(
              text,
              inputs.length > 0 ? inputs : undefined
            ),
            maxRows
          )
          onStatement?.(text, false)
          return set
        } catch (error) {
          onStatement?.(text, true)
          throw error
        }
      })
  )
  return {
    duration: performance.now() - start,
    result: sets.map((set) => resultSet(set, maxRows)),
  }
}

/** DuckDB reports no transaction state, so a session reads it from its own SQL; an error inside a transaction aborts it until a rollback. */
const sessionOn = async (
  connectionString: string,
  opener: string | null,
  readOnly: boolean
): Promise<TxHandle> => {
  const { connection, release: releaseConnection } = await connectTo(
    connectionString,
    readOnly
  )
  let status: TransactionStatus = opener ? 'open' : 'ended'
  if (opener) {
    await connection.run(opener).catch(async (error: unknown) => {
      await releaseConnection()
      throw error
    })
  }
  return {
    commit: async () => {
      await connection.run('COMMIT')
    },
    execute: (sql, values, options) =>
      runOn(
        connection,
        { connectionString, sql, values, ...options },
        (text, failed) => {
          if (failed) {
            status = status === 'open' ? 'failed' : status
          } else if (endsTransaction(text, DUCKDB)) {
            status = 'ended'
          } else if (leavesTransactionOpen(text, DUCKDB)) {
            status = 'open'
          }
        }
      ),
    release: releaseConnection,
    rollback: async () => {
      await connection.run('ROLLBACK')
    },
    status: () => Promise.resolve(status),
  }
}

export const fileTransport = {
  openSession: (connectionString) => sessionOn(connectionString, null, false),

  run: async ({ connectionString, ...args }) => {
    const { connection, release: releaseConnection } = await connectTo(
      connectionString,
      false
    )
    try {
      return await runOn(connection, { connectionString, ...args })
    } finally {
      await releaseConnection()
    }
  },

  transaction: (connectionString, readOnly) =>
    sessionOn(
      connectionString,
      readOnly ? 'BEGIN TRANSACTION READ ONLY' : 'BEGIN TRANSACTION',
      readOnly
    ),
} satisfies DuckdbTransport
