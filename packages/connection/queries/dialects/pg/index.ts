import { logDriverError } from '@tamery/shared/sanitize-log'
import type { ClientBase, Pool } from 'pg'

import type { QueryExecutor, TransactionStatus } from '../..'
import { handleQueryError } from '../..'
import { cancel } from '../../cancellation'
import { registerTransaction, transactionQueries } from '../../transactions'
import { getPool, pg } from './client'
import { runOn } from './run'

const TRANSACTION_STATUS = {
  E: 'failed',
  I: 'ended',
  T: 'open',
} as const satisfies Record<string, TransactionStatus>

const register = (
  client: ClientBase,
  {
    connectionString,
    ownerId,
    pool,
    release,
  }: {
    connectionString: string
    ownerId?: string
    pool: Pool
    release: () => Promise<void>
  }
) =>
  registerTransaction(
    {
      commit: async () => {
        await client.query('COMMIT')
      },
      execute: (sql, values, options) =>
        runOn(client, { connectionString, pool, sql, values }, options),
      release,
      rollback: async () => {
        await client.query('ROLLBACK')
      },
      status: () =>
        Promise.resolve(
          TRANSACTION_STATUS[client.getTransactionStatus() ?? 'I']
        ),
    },
    ownerId
  )

export const query = {
  ...transactionQueries,

  beginTransaction: handleQueryError(
    async ({ accessMode, connectionString, isolationLevel, ownerId }) => {
      const pool = await getPool(connectionString)
      const client = await pool.connect()

      try {
        await client.query(
          [
            'BEGIN',
            isolationLevel && `ISOLATION LEVEL ${isolationLevel}`,
            accessMode,
          ]
            .filter(Boolean)
            .join(' ')
        )
      } catch (error) {
        client.release()
        throw error
      }

      const txId = register(client, {
        connectionString,
        ownerId,
        pool,
        release: () => {
          client.release()
          return Promise.resolve()
        },
      })
      return { txId }
    }
  ),

  cancel,

  execute: handleQueryError(
    async ({ connectionString, query: sql, values = [], ...options }) => {
      const pool = await getPool(connectionString)
      const client = await pool.connect()
      try {
        return await runOn(
          client,
          { connectionString, pool, sql, values },
          options
        )
      } finally {
        client.release()
      }
    }
  ),

  openSession: handleQueryError(async ({ connectionString, ownerId }) => {
    const pool = await getPool(connectionString)
    const client = new pg.Client(pool.options)
    await client.connect()
    // An unhandled `error` (the server dropping the connection) would crash the process.
    client.on('error', logDriverError)
    const txId = register(client, {
      connectionString,
      ownerId,
      pool,
      release: () => client.end(),
    })
    return { txId }
  }),
} satisfies QueryExecutor
