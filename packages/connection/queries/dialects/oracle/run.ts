import { Dialect } from '@tamery/shared/enums/connection-type'
import { dialects, splitStatements } from '@tamery/sql'
import type * as OracleDb from 'oracledb'

import type { RunOptions } from '../..'
import { NO_ROW_COUNT, resultSet } from '../..'
import { cancellable } from '../../cancellation'
import { bindable, fetchTypeHandler } from './values'

export const runOn = async (
  connection: OracleDb.Connection,
  {
    autoCommit,
    connectionString,
    sql,
    values,
  }: {
    autoCommit: boolean
    connectionString: string
    sql: string
    values: unknown[]
  },
  { maxRows = Infinity, queryId }: RunOptions
) => {
  const start = performance.now()
  const results: OracleDb.Result<unknown[]>[] = []
  await cancellable(
    { cancel: () => connection.break(), connectionString, queryId },
    async () => {
      // Oracle runs one statement per call, so a text without bound values is split first; a PL/SQL unit keeps its own semicolons.
      const texts =
        values.length > 0
          ? [sql]
          : splitStatements(sql, dialects[Dialect.Oracle], {
              groupTransactions: false,
            }).map((statement) => statement.text)
      for (const text of texts) {
        results.push(
          // oxlint-disable-next-line no-await-in-loop -- a script's statements run in order on one connection
          await connection.execute<unknown[]>(text, values.map(bindable), {
            autoCommit,
            fetchTypeHandler,
            // One row past the cap tells the set was truncated; 0 reads them all.
            maxRows: Number.isFinite(maxRows) ? maxRows + 1 : 0,
          })
        )
      }
    }
  )
  return {
    duration: performance.now() - start,
    result: results.map(({ metaData = [], rows, rowsAffected = null }) =>
      resultSet(
        rows
          ? {
              affectedRows: NO_ROW_COUNT,
              columns: metaData.map((column) => column.name),
              rows,
            }
          : { affectedRows: rowsAffected, columns: [], rows: [] },
        maxRows
      )
    ),
  }
}
