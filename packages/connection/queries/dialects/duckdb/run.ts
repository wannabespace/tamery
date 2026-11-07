import { Dialect } from '@tamery/shared/enums/connection-type'
import { dialects } from '@tamery/sql'

import type { QueryExecuteResult, RunOptions } from '../..'
import type { TxHandle } from '../../transactions'

export const DUCKDB = dialects[Dialect.DuckDB]

/** How a file and MotherDuck run statements; the executor around them is shared. */
export interface DuckdbTransport {
  run: (
    args: {
      connectionString: string
      sql: string
      values: unknown[]
    } & RunOptions
  ) => Promise<QueryExecuteResult>
  /** `readOnly` also keeps a file's SQL from reading any other file or URL. */
  transaction: (
    connectionString: string,
    readOnly: boolean
  ) => Promise<TxHandle>
  openSession: (connectionString: string) => Promise<TxHandle>
}
