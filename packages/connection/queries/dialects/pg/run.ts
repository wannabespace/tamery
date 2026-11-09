import { once } from 'node:events'

import type { MaybePromise } from '@tamery/shared/utils'
import type { ClientBase, Pool, Query, QueryArrayConfig, QueryResult } from 'pg'

import type { RunOptions, TransactionStatus } from '../..'
import { resultSet } from '../..'
import { cancellable } from '../../cancellation'
import { pg } from './client'

/** The ready-for-query status pg keeps for each connection. */
export const TRANSACTION_STATUS = {
  E: 'failed',
  I: 'ended',
  T: 'open',
} as const satisfies Record<string, TransactionStatus>

const backendPids = new WeakMap<ClientBase, number>()

const backendPid = async (client: ClientBase) => {
  const cached = backendPids.get(client)
  if (cached !== undefined) {
    return cached
  }
  const { rows } = await client.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid'
  )
  const pid = rows[0]?.pid
  if (pid !== undefined) {
    backendPids.set(client, pid)
  }
  return pid
}

/** Readies a cancel of the query about to run on `client`, before it runs: the busy connection answers nothing else. */
export type PrepareCancel = (
  client: ClientBase,
  pool: Pool
) => MaybePromise<(query: Query) => MaybePromise<void>>

// The pool holds one connection and it is busy, so `pg_cancel_backend` needs its own.
const cancelBackend: PrepareCancel = async (client, pool) => {
  const pid = await backendPid(client)
  return async () => {
    if (pid === undefined) {
      return
    }
    const canceller = new pg.Client(pool.options)
    await canceller.connect()
    try {
      await canceller.query('SELECT pg_cancel_backend($1)', [pid])
    } finally {
      await canceller.end()
    }
  }
}

export const runOn = async (
  client: ClientBase,
  {
    connectionString,
    pool,
    prepareCancel = cancelBackend,
    sql,
    values,
  }: {
    connectionString: string
    pool: Pool
    prepareCancel?: PrepareCancel
    sql: string
    values: unknown[]
  },
  { maxRows = Infinity, queryId }: RunOptions
) => {
  const cancelQuery = queryId ? await prepareCancel(client, pool) : null
  const start = performance.now()
  const config: QueryArrayConfig = { rowMode: 'array', text: sql, values }
  const query = new pg.Query(config)
  const [results = []]: (QueryResult | QueryResult[])[] = await cancellable(
    {
      cancel: async () => {
        await cancelQuery?.(query)
      },
      connectionString,
      queryId,
    },
    () =>
      once(
        client
          .query(query)
          // A `row` listener stops pg filling `rows` itself.
          .on('row', (row: unknown[], result) => {
            if (result && result.rows.length <= maxRows) {
              result.rows.push(row)
            }
          }),
        'end'
      )
  )
  return {
    duration: performance.now() - start,
    result: [results].flat().map((item) =>
      resultSet(
        {
          affectedRows: item.fields.length === 0 ? item.rowCount : null,
          columns: item.fields.map((field) => field.name),
          rows: item.rows,
        },
        maxRows
      )
    ),
  }
}
