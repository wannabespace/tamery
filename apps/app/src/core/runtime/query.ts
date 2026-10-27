import { resourceConnectionString } from '@tamery/connection/utils'
import { isConnectionError } from '@tamery/shared/connections'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { noop, toError } from '@tamery/shared/utils'
import type { Type } from 'arktype'
import { Result } from 'better-result'
import type { Transaction } from 'kysely'
import { createStore } from 'seitu'
import { toast } from 'sonner'

import { getCollections } from '~/core/collections'
import type { Connection, ConnectionResource } from '~/core/connection/sync'
import { getConnectionStringToShow } from '~/core/connection/utils'

import { dialects } from './dialects'
import type { DialectOptions } from './dialects/driver'
import type { MongoDatabase } from './dialects/mongodb'
import { logQuery } from './log'
import { watchForSlowQuery } from './slow-queries'

export const connectionToQueryParams = async (
  connection: Connection
): Promise<QueryParams> => {
  const { connectionStringsCollection } = getCollections()
  return {
    connectionId: connection.id,
    connectionString: await connectionStringsCollection.utils.decrypt(
      connection.id
    ),
    dialect: getDialect(connection.type),
  }
}

export const connectionResourceToQueryParams = async (
  connectionResource: ConnectionResource
): Promise<QueryParams> => {
  const { connectionsCollection, connectionStringsCollection } =
    getCollections()
  const connection = connectionsCollection.get(connectionResource.connectionId)

  if (!connection) {
    throw new Error(
      `Connection not found for connection resource "${connectionResource.id}"`
    )
  }

  return {
    connectionString: resourceConnectionString(
      await connectionStringsCollection.utils.decrypt(connection.id),
      connectionResource.name
    ),
    dialect: getDialect(connection.type),
    log: ({ promise, query, values }) =>
      logQuery({ promise, query, resourceId: connectionResource.id, values }),
    resourceId: connectionResource.id,
  }
}

export interface QueryParams {
  connectionString: string
  dialect: Dialect
  resourceId?: string
  connectionId?: string
  resultSets?: DialectOptions['resultSets']
  signal?: AbortSignal
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

const getDatabase = (queryParams: QueryParams) =>
  dialects[queryParams.dialect]({
    connectionId: queryParams.connectionId,
    connectionString: queryParams.connectionString,
    log: queryParams.log,
    resourceId: queryParams.resourceId,
    resultSets: queryParams.resultSets,
    signal: queryParams.signal,
    txId: queryParams.txId,
  })

export const transaction = (queryParams: QueryParams) =>
  getDatabase(queryParams).transaction()

export const MAX_RECONNECTION_ATTEMPTS = 5
const RECONNECTION_DELAY = 3000

export const reconnectingPromises = createStore<
  Record<
    string,
    {
      promise: Promise<unknown>
      resourceId?: string
      attempt: number
    }
  >
>({})

// A query runs across a process boundary (IPC or the proxy), so its error arrives with only a message and no stack; point it back at the call site captured before the query ran.
const withCallStack = (error: unknown, callSite: Error) => {
  const wrapped = toError(error)
  if (!wrapped.stack?.includes('\n    at ')) {
    wrapped.stack = `${wrapped.name}: ${wrapped.message}\n${(callSite.stack ?? '').split('\n').slice(1).join('\n')}`
  }
  return wrapped
}

export const createQuery = <T extends Type = Type<unknown>>(options: {
  type?: T
  query: {
    [D in Dialect]: (
      dialect: ReturnType<(typeof dialects)[D]>
    ) => Promise<T extends Type ? T['inferIn'] : unknown>
  }
}) => {
  const run = async (
    queryParams: QueryParams,
    // oxlint-disable-next-line ts/no-explicit-any
    tx?: Transaction<any> | MongoDatabase
  ): Promise<T extends Type ? T['inferOut'] : unknown> => {
    // Captured before awaiting, so the stack still holds the caller the async boundary would otherwise drop.
    const callSite = new Error('query failed')
    const instance = tx ?? getDatabase(queryParams)
    const queryFn = options.query[queryParams.dialect]

    const connectionStringToShow = getConnectionStringToShow(
      queryParams.connectionString,
      {
        withPathname: true,
        withProtocol: true,
      }
    )
    let attempt = 0

    const resolvers = Promise.withResolvers()
    // Only concurrent reconnect waiters await this; without a handler every
    // failed query surfaces as an unhandled rejection.
    resolvers.promise.catch(noop)

    const canShowToast = () =>
      queryParams.resourceId
        ? location.href.includes(queryParams.resourceId)
        : false

    const stopSlowQueryWatch = queryParams.resourceId
      ? watchForSlowQuery(queryParams.resourceId)
      : noop

    const result = await Result.tryPromise(
      {
        catch: (error) => {
          if (isConnectionError(error)) {
            attempt += 1

            reconnectingPromises.set((state) => {
              const existing = state[queryParams.connectionString]

              return {
                ...state,
                [queryParams.connectionString]: existing
                  ? {
                      ...existing,
                      attempt,
                    }
                  : {
                      attempt,
                      promise: resolvers.promise,
                      resourceId: queryParams.resourceId,
                    },
              }
            })
          }

          return error
        },
        try: async () => {
          const retryPromise =
            reconnectingPromises.get()[queryParams.connectionString]

          if (attempt === 0 && retryPromise) {
            await retryPromise.promise
          }

          // oxlint-disable-next-line ts/no-explicit-any
          return queryFn(instance as any)
        },
      },
      {
        retry: {
          backoff: 'constant',
          delayMs: RECONNECTION_DELAY,
          // A write whose response was lost may still have committed: never retry one.
          shouldRetry: (error) =>
            Boolean(options.type) && isConnectionError(error),
          times: MAX_RECONNECTION_ATTEMPTS,
        },
      }
    )

    stopSlowQueryWatch()

    if (Result.isOk(result)) {
      resolvers.resolve()
      reconnectingPromises.set((state) => {
        const { [queryParams.connectionString]: _removed, ...remaining } = state
        return remaining
      })
      if (canShowToast() && attempt > 0) {
        toast.success(
          `Database connection successful after reconnection ${attempt} attempt${attempt > 1 ? 's' : ''}.`,
          {
            description: connectionStringToShow,
            id: `reconnection-success-${connectionStringToShow}`,
          }
        )
      }

      return options.type
        ? (options.type.assert(result.value) as T extends Type
            ? T['inferOut']
            : unknown)
        : result.value
    }

    if (canShowToast() && isConnectionError(result.error)) {
      toast.error(
        'Could not connect to the connection. Please check your network or connection server and try again.',
        {
          description: connectionStringToShow,
          id: `reconnection-error-${connectionStringToShow}`,
        }
      )
    }

    resolvers.reject(result.error)
    reconnectingPromises.set((state) => {
      const { [queryParams.connectionString]: _removed, ...remaining } = state
      return remaining
    })

    throw withCallStack(result.error, callSite)
  }

  return {
    run,
  }
}
