import type { QueryExecuteResult } from '@tamery/connection/queries'
import { rowObjects } from '@tamery/connection/queries'
import { toQueryPayload } from '@tamery/connection/queries/kysely'
import type { Dialect, SqlDialect } from '@tamery/shared/enums/connection-type'
import { silently } from '@tamery/shared/utils'
import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
  TransactionSettings,
} from 'kysely'

import { createTransport } from './transport'
import type { DialectOptions } from './transport'

interface QueryPayload {
  query: string
  values: unknown[]
  queryId?: string
}

interface TxQueryPayload extends QueryPayload {
  txId: string
}

export const createDialectProvider = (
  dialect: Dialect,
  options: DialectOptions
) => {
  const transport = createTransport(dialect, options)
  const maxRows = options.resultSets?.maxRows
  const running = new Map<string, ReturnType<typeof transport.current>>()
  const track = <T>(
    queryId: string | undefined,
    t: ReturnType<typeof transport.current>,
    call: () => Promise<T>
  ) => {
    if (!queryId) {
      return call()
    }
    running.set(queryId, t)
    return call().finally(() => running.delete(queryId))
  }

  return {
    beginTransaction(settings: TransactionSettings) {
      return transport.open((t) =>
        t.kind === 'electron'
          ? t.electron.beginTransaction({
              connectionString: options.connectionString,
              ...settings,
            })
          : t.proxy.beginTransaction({ ...t.input, ...settings })
      )
    },
    cancel(queryId: string) {
      const t = running.get(queryId) ?? transport.current()
      if (t.kind === 'electron') {
        return t.electron.cancel({
          connectionString: options.connectionString,
          queryId,
        })
      }
      return t.proxy.cancel({ ...t.input, queryId })
    },
    commitTransaction(params: { txId: string }) {
      const t = transport.pinned(params.txId)
      return (
        t.kind === 'electron'
          ? t.electron.commitTransaction(params)
          : t.proxy.commitTransaction(params)
      ).finally(() => transport.release(params.txId))
    },
    execute(payload: QueryPayload) {
      const t = transport.current()
      return track(payload.queryId, t, () =>
        t.kind === 'electron'
          ? t.electron.execute({
              connectionString: options.connectionString,
              ...payload,
              maxRows,
            })
          : t.proxy.execute({ ...t.input, ...payload, maxRows })
      )
    },
    executeTransaction(params: TxQueryPayload) {
      const t = transport.pinned(params.txId)
      const payload = { ...params, maxRows }
      return track(params.queryId, t, () =>
        t.kind === 'electron'
          ? t.electron.executeTransaction(payload)
          : t.proxy.executeTransaction(payload)
      )
    },
    openSession() {
      return transport.open((t) =>
        t.kind === 'electron'
          ? t.electron.openSession({
              connectionString: options.connectionString,
            })
          : t.proxy.openSession(t.input)
      )
    },
    rollbackTransaction(params: { txId: string }) {
      const t = transport.pinned(params.txId)
      return (
        t.kind === 'electron'
          ? t.electron.rollbackTransaction(params)
          : t.proxy.rollbackTransaction(params)
      ).finally(() => transport.release(params.txId))
    },
    async transactionStatus(params: { txId: string }) {
      const t = transport.pinned(params.txId)
      const status = await (t.kind === 'electron'
        ? t.electron.transactionStatus(params)
        : t.proxy.transactionStatus(params))
      if (status === 'ended') {
        transport.release(params.txId)
      }
      return status
    },
  }
}

export const createStatementRunner = (
  dialect: Dialect,
  options: DialectOptions
) => {
  const provider = createDialectProvider(dialect, options)

  const run = (
    payload: Required<QueryPayload>,
    txId: string | null,
    logged: Pick<QueryPayload, 'query' | 'values'> = payload
  ): Promise<QueryExecuteResult> => {
    const { signal } = options
    signal?.throwIfAborted()
    const cancel = () => silently(() => provider.cancel(payload.queryId))
    signal?.addEventListener('abort', cancel, { once: true })
    const promise: Promise<QueryExecuteResult> = (
      txId
        ? provider.executeTransaction({ txId, ...payload })
        : provider.execute(payload)
    ).finally(() => signal?.removeEventListener('abort', cancel))
    options.log?.({
      promise: promise.then(({ duration, result }) => ({
        duration,
        result: options.resultSets ? result : rowObjects(result),
      })),
      ...logged,
    })
    return promise
  }

  return { provider, run }
}

export const createKyselyDriver = (
  dialect: SqlDialect,
  options: DialectOptions
) => {
  const { provider, run } = createStatementRunner(dialect, options)
  const txStates = new WeakMap<DatabaseConnection, { txId: string | null }>()

  const executeAndLog = async (
    compiledQuery: CompiledQuery,
    txId: string | null
  ) => {
    const { result } = await run(
      {
        ...toQueryPayload(dialect, compiledQuery),
        queryId: compiledQuery.queryId.queryId,
      },
      txId,
      {
        query: compiledQuery.sql,
        values: compiledQuery.parameters as unknown[],
      }
    )
    return options.resultSets ? result : rowObjects(result)
  }

  return {
    acquireConnection() {
      const state: { txId: string | null } = { txId: null }
      const connection: DatabaseConnection = {
        executeQuery: async <R>(
          compiledQuery: CompiledQuery
        ): Promise<QueryResult<R>> => {
          const rows = await executeAndLog(
            compiledQuery,
            state.txId ?? options.txId ?? null
          )
          return { rows: rows as R[] }
        },
        streamQuery() {
          throw new Error('Not implemented')
        },
      }
      txStates.set(connection, state)
      return Promise.resolve(connection)
    },
    async beginTransaction(connection, settings) {
      const state = txStates.get(connection)
      if (!state) {
        throw new Error('Transaction state missing for acquired connection')
      }

      const { txId } = await provider.beginTransaction(settings)
      state.txId = txId
    },
    async commitTransaction(connection) {
      const state = txStates.get(connection)
      if (!state?.txId) {
        return
      }
      options.signal?.throwIfAborted()
      await provider.commitTransaction({ txId: state.txId })
      state.txId = null
    },
    destroy() {
      return Promise.resolve()
    },
    init() {
      return Promise.resolve()
    },
    async releaseConnection(connection) {
      const state = txStates.get(connection)
      if (!state?.txId) {
        return
      }
      const { txId } = state
      state.txId = null
      await silently(() => provider.rollbackTransaction({ txId }))
    },
    async rollbackTransaction(connection) {
      const state = txStates.get(connection)
      if (!state?.txId) {
        return
      }
      const { txId } = state
      state.txId = null
      await provider.rollbackTransaction({ txId })
    },
  } satisfies Driver
}
