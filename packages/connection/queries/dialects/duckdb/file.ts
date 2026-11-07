import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type {
  DuckDBConnection,
  DuckDBInstance,
  DuckDBResult,
  DuckDBValue,
  DuckDBValueConverter,
  Json,
} from '@duckdb/node-api'
import type * as DuckdbModule from '@duckdb/node-api'
import { silently } from '@tamery/shared/utils'
import {
  endsTransaction,
  leavesTransactionOpen,
  splitStatements,
} from '@tamery/sql'
import { memoize } from 'memoza'

import type { ResultSet, RunOptions, TransactionStatus } from '../..'
import { resultSet } from '../..'
import { databaseFile } from '../../../database-file'
import { cancellable } from '../../cancellation'
import type { TxHandle } from '../../transactions'
import type { DuckdbTransport } from './run'
import { DUCKDB } from './run'

const FILE_BUSY_TIMEOUT_MS = 10_000

const FILE_BUSY = `Tamery still has this file open in another mode after ${FILE_BUSY_TIMEOUT_MS / 1000} seconds. Finish the transaction open on it, then try again.`

// Loaded on first use: only the desktop app ships DuckDB, and nothing else opens a file.
const loadDuckdb = memoize(() => {
  try {
    return createRequire(import.meta.url)(
      '@duckdb/node-api'
    ) as typeof DuckdbModule
  } catch (error) {
    throw new Error('DuckDB files open only in the Tamery desktop app.', {
      cause: error,
    })
  }
})

/** The JSON converter, but an interval reads as DuckDB's own text, which a cell writes back as is. */
const getConverter = memoize((): DuckDBValueConverter<Json> => {
  const { DuckDBTypeId, JsonDuckDBValueConverter } = loadDuckdb()
  return (value, type, converter) =>
    type.typeId === DuckDBTypeId.INTERVAL && value !== null
      ? String(value)
      : JsonDuckDBValueConverter(value, type, converter)
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
    const rows: unknown[][] = []
    for await (const chunk of result.yieldConvertedRows(getConverter())) {
      rows.push(...chunk)
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

interface OpenFile {
  closed: PromiseWithResolvers<void>
  instance: Promise<DuckDBInstance>
  readOnly: boolean
  users: number
}

/**
 * One instance per file: two in one process each keep their own state of the file and never see the other's writes.
 * It closes once its last user is done, so another tool can open the file between Tamery's calls.
 */
const openFiles = new Map<string, OpenFile>()

const release = async (file: string) => {
  const entry = openFiles.get(file)
  if (!entry) {
    return
  }
  entry.users -= 1
  if (entry.users > 0) {
    return
  }
  openFiles.delete(file)
  await silently(async () => {
    const instance = await entry.instance
    instance.closeSync()
  })
  entry.closed.resolve()
}

const waitForClose = (entry: OpenFile) =>
  Promise.race([
    entry.closed.promise,
    sleep(FILE_BUSY_TIMEOUT_MS, null, { ref: false }).then(() => {
      throw new Error(FILE_BUSY)
    }),
  ])

/** A read-only instance also turns off reading any other file or URL, which DuckDB allows only per instance. */
const acquire = async (
  file: string,
  readOnly: boolean
): Promise<DuckDBInstance> => {
  const current = openFiles.get(file)
  if (current && current.readOnly !== readOnly) {
    await waitForClose(current)
    return acquire(file, readOnly)
  }
  if (current) {
    current.users += 1
    return current.instance
  }
  // DuckDB would create an empty database at a mistyped path.
  if (!existsSync(file)) {
    throw new Error(`There is no file at ${file}.`)
  }
  const entry: OpenFile = {
    closed: Promise.withResolvers(),
    instance: loadDuckdb().DuckDBInstance.create(
      file,
      readOnly
        ? { access_mode: 'READ_ONLY', enable_external_access: 'false' }
        : {}
    ),
    readOnly,
    users: 1,
  }
  openFiles.set(file, entry)
  return entry.instance
}

const connectTo = async (connectionString: string, readOnly: boolean) => {
  const file = databaseFile.path(connectionString)
  const local = file.startsWith('~/')
    ? path.join(homedir(), file.slice(2))
    : file
  try {
    const instance = await acquire(local, readOnly)
    const connection = await instance.connect()
    return {
      connection,
      release: () => {
        connection.closeSync()
        return release(local)
      },
    }
  } catch (error) {
    await release(local)
    throw error
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
