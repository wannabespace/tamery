import { sleep } from '@tamery/shared/utils'
import { NonRetriableError } from '@tanstack/offline-transactions'
import type { PendingMutation, SyncConfig } from '@tanstack/react-db'
import { BasicIndex } from '@tanstack/react-db'
import { Result } from 'better-result'

import { isUnauthorizedError } from '~/utils/error'

import { database } from './database'
import { posthog } from './posthog'

export interface BaseTable {
  id: string
  createdAt: Date
  updatedAt: Date
}

interface SyncTracker {
  markSynced: (key: string, updatedAt: Date) => void
  awaitChange: (key: string, updatedAt: Date, timeout?: number) => Promise<void>
}

const versionKey = (key: string, updatedAt: Date) =>
  `${key}:${updatedAt.getTime()}`

const createSyncTracker = (): SyncTracker => {
  const synced = new Set<string>()
  const listeners = new Set<() => void>()

  return {
    awaitChange(key, updatedAt, timeout = 10_000) {
      const versioned = versionKey(key, updatedAt)

      if (synced.has(versioned)) {
        return Promise.resolve()
      }

      const { promise, resolve, reject } = Promise.withResolvers<undefined>()

      const listener = () => {
        if (synced.has(versioned)) {
          resolve()
        }
      }

      const timer = setTimeout(() => {
        reject(new Error('awaitChange timed out'))
      }, timeout)

      listeners.add(listener)

      return promise.finally(() => {
        clearTimeout(timer)
        listeners.delete(listener)
      })
    },
    markSynced(key, updatedAt) {
      synced.add(versionKey(key, updatedAt))
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

// Every persisted collection must pass this one version, or they reset each
// other's tables on every boot. Bumping it wipes local data.
export const PERSISTED_SCHEMA_VERSION = 2

export type SyncMessage<T> =
  | { type: 'insert'; value: T }
  | { type: 'update'; value: T }
  | { type: 'delete'; key: string }

type SyncEventsFn<T> = (params: {
  signal: AbortSignal
  write: (message: SyncMessage<T>) => void
}) => void | Promise<void>

const RETRY_MIN_DELAY = 1000
const RETRY_MAX_DELAY = 30_000

interface ServerMutations<T> {
  delete?: (key: string) => Promise<unknown>
  insert?: (value: T) => Promise<T | undefined> | Promise<void>
  update?: (key: string, changes: Partial<T>, row: T) => Promise<unknown>
}

export interface SyncCollectionConfig<T extends { updatedAt: Date }> {
  id: string
  getKey: (item: T) => string
  events: SyncEventsFn<T>
  sync: (params: {
    rows: { id: string; updatedAt: Date }[]
    signal: AbortSignal
  }) => Promise<SyncMessage<T>[]>
  mutations?: ServerMutations<T>
}

export const syncCollectionOptions = <T extends { updatedAt: Date }>(
  config: SyncCollectionConfig<T>
) => {
  const tracker = createSyncTracker()
  const firstSync = Promise.withResolvers<undefined>()
  let writeSynced: ((items: SyncMessage<T>[]) => void) | null = null
  let abortSync: (() => void) | null = null

  const sync: SyncConfig<T, string> = {
    sync: ({ begin, commit, write, collection, markReady }) => {
      const abortController = new AbortController()
      const { signal } = abortController

      const writeItem = (item: SyncMessage<T>) => {
        if (item.type === 'delete') {
          write({ key: item.key, type: 'delete' })
          return
        }
        // Always an upsert: `push` may already have written the row as synced,
        // and an `insert` of a differing value throws DuplicateKeySyncError.
        write({ type: 'update', value: item.value })
        tracker.markSynced(config.getKey(item.value), item.value.updatedAt)
      }

      const writeItems = (items: SyncMessage<T>[]) => {
        if (signal.aborted) {
          return
        }

        begin()
        for (const item of items) {
          writeItem(item)
        }
        commit()
      }

      const subscribe = async () => {
        const attempt = new AbortController()
        const attemptSignal = AbortSignal.any([signal, attempt.signal])
        let buffered: SyncMessage<T>[] | null = []
        const events = config.events({
          signal: attemptSignal,
          write: (item) => {
            if (buffered) {
              buffered.push(item)
            } else {
              writeItems([item])
            }
          },
        })
        const catchUp = async () => {
          try {
            await collection.toArrayWhenReady()
            // Server versions, not visible rows: an unsent insert would come
            // back as a delete racing the outbox, and a row with a pending
            // edit or delete would come back as new, overwriting the replay.
            const rows = [...collection._state.syncedData.values()].map(
              (item) => ({ id: config.getKey(item), updatedAt: item.updatedAt })
            )
            writeItems(await config.sync({ rows, signal: attemptSignal }))
          } finally {
            writeItems(buffered ?? [])
            buffered = null
            firstSync.resolve()
          }
        }

        try {
          await Promise.all([catchUp(), events])
        } finally {
          attempt.abort()
        }
      }

      const run = async () => {
        let failures = 0

        while (!signal.aborted) {
          if (!navigator.onLine) {
            firstSync.resolve()
            const online = Promise.withResolvers<undefined>()
            window.addEventListener('online', () => online.resolve(), {
              once: true,
              signal,
            })
            // oxlint-disable-next-line no-await-in-loop
            await online.promise
          }
          // oxlint-disable-next-line no-await-in-loop
          const result = await Result.tryPromise({
            catch: (error) => error,
            try: subscribe,
          })

          if (result.isOk()) {
            failures = 0
          } else if (signal.aborted) {
            return
          } else if (isUnauthorizedError(result.error)) {
            abortController.abort(`${config.id} sync unauthorized`)
            return
          } else {
            if (navigator.onLine) {
              posthog.captureException(result.error)
            }
            failures += 1
          }

          // oxlint-disable-next-line no-await-in-loop
          await sleep(
            Math.min(RETRY_MIN_DELAY * 2 ** failures, RETRY_MAX_DELAY),
            signal
          )
        }
      }

      writeSynced = writeItems
      abortSync = () => {
        abortController.abort(`${config.id} sync aborted`)
        firstSync.resolve()
      }
      markReady()
      run()

      return abortSync
    },
  }

  const serverMutation = <K extends keyof ServerMutations<T>>(type: K) => {
    const send = config.mutations?.[type]
    if (!send) {
      throw new NonRetriableError(`${config.id} has no server ${type}`)
    }
    return send
  }

  return {
    autoIndex: 'eager' as const,
    defaultIndexType: BasicIndex,
    getKey: config.getKey,
    id: config.id,
    sync,
    utils: {
      abortSync: () => abortSync?.(),
      awaitChange: tracker.awaitChange,
      push: async (mutation: PendingMutation<T>) => {
        if (mutation.type === 'delete') {
          await serverMutation('delete')(mutation.key)
          writeSynced?.([{ key: mutation.key, type: 'delete' }])
          return
        }

        if (mutation.type === 'update') {
          await serverMutation('update')(
            mutation.key,
            mutation.changes,
            mutation.modified
          )
          writeSynced?.([{ type: 'update', value: mutation.modified }])
          return
        }

        // A conflicting insert keeps the server's row, which may have another id.
        const stored = await serverMutation('insert')(mutation.modified)
        writeSynced?.([{ type: 'update', value: stored ?? mutation.modified }])
      },
      whenSynced: () => firstSync.promise,
    },
  }
}

export const clearDb = async () => {
  const result = await Result.tryPromise({
    catch: (error) => error,
    try: async () => {
      await database.execute('PRAGMA foreign_keys = OFF;')

      const tablesResult = await database.execute(`
        SELECT name
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%';
      `)

      const systemTables = new Set([
        'collection_registry',
        'persisted_index_registry',
        'applied_tx',
        'collection_version',
        'collection_metadata',
        'leader_term',
        'schema_version',
        'collection_reset_epoch',
      ])

      for (const table of tablesResult as { name: string }[]) {
        const tableName = table.name

        if (tableName && !systemTables.has(tableName)) {
          // Sequential by design: statements run on a single SQLite connection
          // oxlint-disable-next-line no-await-in-loop
          await database.execute(`DELETE FROM "${tableName}";`)
        }
      }

      await database.execute('PRAGMA foreign_keys = ON;')
      await database.execute('VACUUM;')
    },
  })

  if (result.isErr()) {
    posthog.captureException(result.error)
    await Result.tryPromise(() => database.execute('PRAGMA foreign_keys = ON;'))
  }
}

if (import.meta.env.DEV) {
  // oxlint-disable-next-line consistent-function-scoping
  const getCollectionTableName = async (name: string) => {
    const collections = (await database.execute(
      'SELECT * FROM collection_registry'
    )) as {
      collection_id: string
      table_name: string
      schema_version: number
    }[]
    const matching = collections.filter((c) => c.collection_id === name)
    if (matching.length === 0) {
      return
    }

    const [latest] = matching.toSorted(
      (a, b) => b.schema_version - a.schema_version
    )
    return latest?.table_name
  }

  const showCollection = async (name: string) => {
    const tableName = await getCollectionTableName(name)
    if (!tableName) {
      return
    }

    const collection = (await database.execute(
      `SELECT * FROM ${tableName}`
    )) as {
      key: string
      metadata: unknown
      row_version: number
      value: string
    }[]

    // oxlint-disable-next-line no-console
    console.log(collection.map((c) => JSON.parse(c.value)))
  }

  // @ts-expect-error window is not typed
  window.showCollection = showCollection
}
