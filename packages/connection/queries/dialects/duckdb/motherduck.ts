import { logDriverError } from '@tamery/shared/sanitize-log'
import { memoize } from 'memoza'
import type { ClientBase, Pool, Query } from 'pg'

import { connectionParts } from '../../../connection-parts'
import { forwarding } from '../../../forwarding'
import { readConnectionString } from '../../../parse-connection-string'
import type { TxHandle } from '../../transactions'
import { pg } from '../pg/client'
import type { PrepareCancel } from '../pg/run'
import { runOn, TRANSACTION_STATUS } from '../pg/run'
import type { DuckdbTransport } from './run'

const MOTHERDUCK_USER = 'postgres'
/** The endpoint's own name for every database of the workspace. */
const WORKSPACE_DATABASE = 'md:'

/**
 * DuckDB SQL over the Postgres protocol: the endpoint runs it on MotherDuck, which never reads a file on the machine
 * sending it, so the cloud proxy can run it too.
 */
const getPool = memoize(async (connectionString: string) => {
  const { database, host, password } = readConnectionString(connectionString)
  const port = connectionParts.port(connectionParts.parse(connectionString))
  const tunnel = await forwarding.of(connectionString)
  const pool = new pg.Pool({
    ...(tunnel && { stream: tunnel.socket }),
    connectionTimeoutMillis: 30_000,
    database: database || WORKSPACE_DATABASE,
    host,
    max: 1,
    // Only a function keeps pg from falling back to `PGPASSWORD` and `~/.pgpass`.
    password: () => password,
    port: Number(port),
    ssl: true,
    user: MOTHERDUCK_USER,
  })
  pool.on('error', logDriverError)
  await pool.query('SELECT 1')
  return pool
})

// The endpoint has no `pg_cancel_backend`; pg's own cancel sends the protocol's CancelRequest over a connection of its own.
const cancelOnWire: PrepareCancel = (client, pool) => (query) => {
  // `cancel` is pg's own, left out of its types.
  const canceller = new pg.Client(pool.options) as unknown as {
    cancel: (busy: ClientBase, query: Query) => void
  }
  canceller.cancel(client, query)
}

const handleOn = (
  client: ClientBase,
  {
    connectionString,
    pool,
    release,
  }: { connectionString: string; pool: Pool; release: () => Promise<void> }
): TxHandle => ({
  commit: async () => {
    await client.query('COMMIT')
  },
  execute: (sql, values, options) =>
    runOn(
      client,
      { connectionString, pool, prepareCancel: cancelOnWire, sql, values },
      options
    ),
  release,
  rollback: async () => {
    await client.query('ROLLBACK')
  },
  status: () =>
    Promise.resolve(TRANSACTION_STATUS[client.getTransactionStatus() ?? 'I']),
})

export const motherduckTransport = {
  openSession: async (connectionString) => {
    const pool = await getPool(connectionString)
    const client = new pg.Client(pool.options)
    await client.connect()
    // An unhandled `error` (the server dropping the connection) would crash the process.
    client.on('error', logDriverError)
    return handleOn(client, {
      connectionString,
      pool,
      release: () => client.end(),
    })
  },

  run: async ({ connectionString, sql, values, ...options }) => {
    const pool = await getPool(connectionString)
    const client = await pool.connect()
    try {
      return await runOn(
        client,
        { connectionString, pool, prepareCancel: cancelOnWire, sql, values },
        options
      )
    } finally {
      client.release()
    }
  },

  transaction: async (connectionString, readOnly) => {
    const pool = await getPool(connectionString)
    const client = await pool.connect()
    try {
      await client.query(
        readOnly ? 'BEGIN TRANSACTION READ ONLY' : 'BEGIN TRANSACTION'
      )
    } catch (error) {
      client.release()
      throw error
    }
    return handleOn(client, {
      connectionString,
      pool,
      release: () => {
        client.release()
        return Promise.resolve()
      },
    })
  },
} satisfies DuckdbTransport
