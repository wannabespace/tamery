import { once } from 'node:events'

import type { Connection, PoolOptions, ResultSetHeader } from 'mysql2'
import type * as mysql2Promise from 'mysql2/promise'

import type { ResultSet, RunOptions } from '../..'
import { NO_ROW_COUNT, resultSet } from '../..'
import { cancellable } from '../../cancellation'
import { mysql2 } from './client'

// mysql2 fills every `?`, so one inside a quoted literal or identifier would take a later placeholder's value.
const placeholderRegex =
  /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`]|``)*`|\?/gu

export const inlineValues = (
  sql: string,
  values: unknown[],
  escape: (value: unknown) => string
) => {
  let index = 0
  return sql.replaceAll(placeholderRegex, (token) => {
    if (token !== '?') {
      return token
    }
    index += 1
    return escape(values[index - 1])
  })
}

export const runOn = async (
  connection: mysql2Promise.Connection,
  {
    conf,
    connectionString,
    sql,
    values,
  }: {
    conf: PoolOptions
    connectionString: string
    sql: string
    values: unknown[]
  },
  { maxRows = Infinity, queryId }: RunOptions
) => {
  // The pool holds one connection and it is busy, so `KILL QUERY` needs its own.
  const cancel = async () => {
    const killer = await mysql2.createConnection(conf)
    try {
      await killer.query('KILL QUERY ?', [connection.threadId])
    } finally {
      await killer.end()
    }
  }

  const start = performance.now()
  const sets: Omit<ResultSet, 'truncated'>[] = []
  await cancellable({ cancel, connectionString, queryId }, () => {
    // Every promise wrapper, pooled or not, holds the core connection (whose `query` streams events) at `.connection`; mysql2 types it only on a pool's, and as another promise one.
    const { connection: core } = connection as unknown as {
      connection: Connection
    }
    const query = core
      .query({
        rowsAsArray: true,
        sql:
          values.length > 0
            ? inlineValues(sql, values, (value) => connection.escape(value))
            : sql,
      })
      .on('fields', (fields?: mysql2Promise.FieldPacket[]) => {
        sets.push({
          affectedRows: NO_ROW_COUNT,
          columns: fields?.map((field) => field.name) ?? [],
          rows: [],
        })
      })
      .on('result', (result: unknown[] | ResultSetHeader) => {
        const set = sets.at(-1)
        if (!set) {
          return
        }
        if (!Array.isArray(result)) {
          set.affectedRows = result.affectedRows
        } else if (set.rows.length <= maxRows) {
          set.rows.push(result)
        }
      })
    return once(query, 'end')
  })
  return {
    duration: performance.now() - start,
    result: sets.map((set) => resultSet(set, maxRows)),
  }
}
