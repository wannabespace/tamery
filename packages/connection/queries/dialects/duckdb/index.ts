import { Provider } from '@tamery/shared/enums/connection-type'

import type { QueryExecutor } from '../..'
import { handleQueryError } from '../..'
import { getProviderOfScheme } from '../../../connection-parts'
import { readConnectionString } from '../../../parse-connection-string'
import { cancel } from '../../cancellation'
import { registerTransaction, transactionQueries } from '../../transactions'
import { fileTransport } from './file'
import { motherduckTransport } from './motherduck'
import type { DuckdbTransport } from './run'

/** Only an empty host opens a file, whatever the scheme says, so no server ever opens one on its own disk. */
const getTransport = (connectionString: string): DuckdbTransport => {
  const { host, scheme } = readConnectionString(connectionString)
  if (!host) {
    return fileTransport
  }
  if (getProviderOfScheme(scheme) !== Provider.MotherDuck) {
    throw new Error(
      `Tamery cannot tell which service runs this DuckDB server: its string starts with ${scheme}://, not motherduck://.`
    )
  }
  return motherduckTransport
}

/** DuckDB has only snapshot isolation, so a transaction's isolation level is left out of its opener. */
export const query = {
  ...transactionQueries,

  beginTransaction: handleQueryError(
    async ({ accessMode, connectionString, ownerId }) => ({
      txId: registerTransaction(
        await getTransport(connectionString).transaction(
          connectionString,
          accessMode === 'read only'
        ),
        ownerId
      ),
    })
  ),

  cancel,

  execute: handleQueryError(
    ({ connectionString, query: sql, values = [], ...options }) =>
      getTransport(connectionString).run({
        connectionString,
        sql,
        values,
        ...options,
      })
  ),

  openSession: handleQueryError(async ({ connectionString, ownerId }) => ({
    txId: registerTransaction(
      await getTransport(connectionString).openSession(connectionString),
      ownerId
    ),
  })),
} satisfies QueryExecutor
