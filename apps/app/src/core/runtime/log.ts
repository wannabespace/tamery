import { memoize } from 'memoza'
import { createStore } from 'seitu'

export interface QueryLog {
  id: string
  query: string
  createdAt: Date
  result: unknown | null
  duration: number | null
  values: unknown[]
  error: string | null
}

const LOG_LIMIT = 500

export const getQueryLogsStore = memoize((_resourceId: string) =>
  createStore<QueryLog[]>([])
)

const patchLog = (
  store: ReturnType<typeof getQueryLogsStore>,
  id: string,
  patch: Partial<QueryLog>
) =>
  store.set((logs) =>
    logs.map((log) => (log.id === id ? { ...log, ...patch } : log))
  )

/** One statement as a dialect reports it, settling once the statement does. */
export interface QueryLogEntry {
  promise: Promise<{ duration: number; result: unknown }>
  query: string
  values?: unknown[]
}

export const logQuery = async ({
  resourceId,
  promise,
  query,
  values = [],
}: QueryLogEntry & { resourceId: string }) => {
  const store = getQueryLogsStore(resourceId)
  const id = crypto.randomUUID()

  store.set((logs) =>
    [
      ...logs,
      {
        createdAt: new Date(),
        duration: null,
        error: null,
        id,
        query,
        result: null,
        values,
      },
    ].slice(-LOG_LIMIT)
  )

  try {
    const { result, duration } = await promise
    patchLog(store, id, { duration, result })
  } catch (error) {
    patchLog(store, id, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
