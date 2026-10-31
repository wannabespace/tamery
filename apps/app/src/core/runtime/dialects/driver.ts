import type { QueryExecuteResult } from '@tamery/connection/queries'
import { rowObjects } from '@tamery/connection/queries'
import { toQueryPayload } from '@tamery/connection/queries/kysely'
import { describeConnectionString } from '@tamery/connection/utils'
import type { Dialect, SqlDialect } from '@tamery/shared/enums/connection-type'
import { LOCAL_PROXY_URL } from '@tamery/shared/ports'
import { silently } from '@tamery/shared/utils'
import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
  TransactionSettings,
} from 'kysely'

import { getCollections } from '~/core/collections'
import { fetchingConfig } from '~/core/connection/fetching-config'
import { getConnectionStore } from '~/core/connection/stores'
import { createProxyClient, orpcProxy } from '~/lib/orpc'

export interface DialectOptions {
  connectionString: string
  connectionId?: string
  resourceId?: string
  resultSets?: { maxRows: number }
  signal?: AbortSignal
  /** Runs every query in this open transaction or session instead of the pool. */
  txId?: string
  log?: (params: {
    promise: Promise<{
      result: unknown
      duration: number
    }>
    query: string
    values?: unknown[]
  }) => void
}

const getCloudProxyInput = (options: DialectOptions) => {
  if (options.resourceId) {
    return { resourceId: options.resourceId }
  }
  if (options.connectionId) {
    return { connectionId: options.connectionId }
  }
  return { connectionString: options.connectionString }
}

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
  const { connectionsCollection, connectionsResourcesCollection } =
    getCollections()
  const resource = options.resourceId
    ? connectionsResourcesCollection.get(options.resourceId)
    : null
  const connectionId = options.connectionId || resource?.connectionId
  const connection = connectionId
    ? (connectionsCollection.get(connectionId) ?? null)
    : null

  const maxRows = options.resultSets?.maxRows
  const resolveTransport = () => {
    const proxy = connectionId
      ? getConnectionStore(connectionId).get().proxy
      : { enabled: false, url: null }
    const config = fetchingConfig(connection, {
      connectionString: describeConnectionString(options.connectionString),
      proxy,
    })

    if (!config.canSend) {
      throw new Error(config.reason ?? 'This connection is still loading.')
    }

    if (config.type === 'proxy') {
      const client = createProxyClient(proxy.url || LOCAL_PROXY_URL)
      return {
        input: { connectionString: options.connectionString },
        kind: 'proxy' as const,
        proxy: client[dialect],
      }
    }

    const electron = window.electron?.query[dialect]
    if (electron) {
      return { electron, kind: 'electron' as const }
    }

    return {
      input: getCloudProxyInput(options),
      kind: 'proxy' as const,
      proxy: orpcProxy.query[dialect],
    }
  }

  return {
    beginTransaction(settings: TransactionSettings) {
      const t = resolveTransport()
      if (t.kind === 'electron') {
        return t.electron.beginTransaction({
          connectionString: options.connectionString,
          ...settings,
        })
      }
      return t.proxy.beginTransaction({ ...t.input, ...settings })
    },
    cancel(queryId: string) {
      const t = resolveTransport()
      if (t.kind === 'electron') {
        return t.electron.cancel({
          connectionString: options.connectionString,
          queryId,
        })
      }
      return t.proxy.cancel({ ...t.input, queryId })
    },
    commitTransaction(params: { txId: string }) {
      const t = resolveTransport()
      return t.kind === 'electron'
        ? t.electron.commitTransaction(params)
        : t.proxy.commitTransaction(params)
    },
    execute(payload: QueryPayload) {
      const t = resolveTransport()
      return t.kind === 'electron'
        ? t.electron.execute({
            connectionString: options.connectionString,
            ...payload,
            maxRows,
          })
        : t.proxy.execute({ ...t.input, ...payload, maxRows })
    },
    executeTransaction(params: TxQueryPayload) {
      const t = resolveTransport()
      const payload = { ...params, maxRows }
      return t.kind === 'electron'
        ? t.electron.executeTransaction(payload)
        : t.proxy.executeTransaction(payload)
    },
    openSession() {
      const t = resolveTransport()
      return t.kind === 'electron'
        ? t.electron.openSession({ connectionString: options.connectionString })
        : t.proxy.openSession(t.input)
    },
    rollbackTransaction(params: { txId: string }) {
      const t = resolveTransport()
      return t.kind === 'electron'
        ? t.electron.rollbackTransaction(params)
        : t.proxy.rollbackTransaction(params)
    },
    transactionStatus(params: { txId: string }) {
      const t = resolveTransport()
      return t.kind === 'electron'
        ? t.electron.transactionStatus(params)
        : t.proxy.transactionStatus(params)
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
