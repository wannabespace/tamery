import { unsupported } from '@tamery/shared/unsupported'
import { noop } from '@tamery/shared/utils'

import type { QueryExecutor } from '../..'
import { handleQueryError } from '../..'
import { cancel } from '../../cancellation'
import { registerTransaction, transactionQueries } from '../../transactions'
import { runQuery } from './run'

const execute = handleQueryError(runQuery)

export const query = {
  ...transactionQueries,

  beginTransaction: handleQueryError(({ connectionString, ownerId }) =>
    Promise.resolve({
      txId: registerTransaction(
        {
          commit: noop,
          execute: (sql, _values, options) =>
            execute({ connectionString, query: sql, ...options }),
          release: noop,
          rollback: noop,
        },
        ownerId
      ),
    })
  ),

  cancel,

  execute,

  openSession: unsupported('Transactions'),
} satisfies QueryExecutor
