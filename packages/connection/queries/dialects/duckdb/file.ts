import { realpath } from 'node:fs/promises'
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

interface OpenFile {
  closed: PromiseWithResolvers<void>
  instance: Promise<DuckDBInstance>
  readOnly: boolean
  users: number
}

/**
 * One instance per file, keyed by its real path: two in one process each keep their own state of the file and never see
 * the other's writes, a symlink's included. It closes once its last user is done, so another tool can open the file
 * between Tamery's calls.
 */
const openFiles = new Map<string, OpenFile>()

const waitForClose = (entry: OpenFile) =>
  Promise.race([
    entry.closed.promise,
    sleep(FILE_BUSY_TIMEOUT_MS, null, { ref: false }).then(() => {
      throw new Error(FILE_BUSY)
    }),
  ])

const open = (file: string, readOnly: boolean) => {
  const entry: OpenFile = {
    closed: Promise.withResolvers(),
    instance: loadDuckdb().DuckDBInstance.create(
      file,
      readOnly
        ? { access_mode: 'READ_ONLY', enable_external_access: 'false' }
        : {}
    ),
    readOnly,
    users: 0,
  }
  openFiles.set(file, entry)
  return entry
}

/**
 * Resolves only once this call holds a use of the file's instance, and its `release` gives back that use alone. A read-only
 * instance also turns off reading any other file or URL, which DuckDB allows only per instance.
 */
const acquire = async (
  file: string,
  readOnly: boolean
): Promise<{ instance: DuckDBInstance; release: () => Promise<void> }> => {
  const current = openFiles.get(file)
  if (current && current.readOnly !== readOnly) {
    await waitForClose(current)
    return acquire(file, readOnly)
  }
  const entry = current ?? open(file, readOnly)
  entry.users += 1
  const release = async () => {
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
  try {
    return { instance: await entry.instance, release }
  } catch (error) {
    await release()
    throw error
  }
}

const connectTo = async (connectionString: string, readOnly: boolean) => {
  const file = databaseFile.path(connectionString)
  // DuckDB would create an empty database at a mistyped path.
  const real = await realpath(
    file.startsWith('~/') ? path.join(homedir(), file.slice(2)) : file
  ).catch((error: unknown) => {
    throw new Error(`There is no file at ${file}.`, { cause: error })
  })
  const { instance, release } = await acquire(real, readOnly)
  try {
    const connection = await instance.connect()
    return {
      connection,
      release: () => {
        connection.closeSync()
        return release()
      },
    }
  } catch (error) {
    await release()
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
