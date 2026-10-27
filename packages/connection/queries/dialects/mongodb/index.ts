import { unsupported } from '@tamery/shared/unsupported'

import type { QueryExecutor } from '../..'
import { handleQueryError } from '../..'
import { cancel } from '../../cancellation'
import { registerTransaction, transactionQueries } from '../../transactions'
import { getClient, supportsTransactions } from './client'
import { runScript } from './run'

export const query = {
  ...transactionQueries,

  beginTransaction: handleQueryError(
    async ({ accessMode, connectionString, ownerId }) => {
      const client = await getClient(connectionString)
      const readOnly = accessMode === 'read only'
      // A standalone server has no transactions, so its calls run one by one, as ClickHouse's do; read only still holds.
      const session = (await supportsTransactions(connectionString))
        ? client.startSession()
        : null
      session?.startTransaction()
      const txId = registerTransaction(
        {
          commit: async () => {
            await session?.commitTransaction()
          },
          execute: (text, _values, options) =>
            runScript(
              client,
              {
                connectionString,
                readOnly,
                session: session ?? undefined,
                text,
              },
              options
            ),
          release: () => session?.endSession(),
          rollback: async () => {
            await session?.abortTransaction()
          },
        },
        ownerId
      )
      return { txId }
    }
  ),

  cancel,

  execute: handleQueryError(
    async ({ connectionString, query: text, ...options }) =>
      runScript(
        await getClient(connectionString),
        { connectionString, readOnly: false, text },
        options
      )
  ),

  openSession: unsupported('Transactions'),
} satisfies QueryExecutor
