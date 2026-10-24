import type { Dialect } from '@tamery/shared/enums/connection-type'

import { getQueryLanguage } from '~/core/runtime/language'

import { customQuery } from './custom'
import { transactionQuery } from './transaction'

export const statementQuery = (text: string, dialect: Dialect) => {
  const language = getQueryLanguage(dialect)
  const transaction = language.unwrapTransaction(text)
  if (transaction) {
    return transactionQuery(transaction)
  }
  if (language.leavesTransactionOpen(text)) {
    throw new Error(
      language.transactions
        ? 'Run BEGIN together with its COMMIT or ROLLBACK. A transaction left open would hold the connection the rest of the app uses.'
        : 'This database has no transactions. Run the statements without BEGIN.'
    )
  }
  return customQuery({ query: text })
}
