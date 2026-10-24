import type { ResultSet } from '@tamery/connection/queries'
import { rowObjects } from '@tamery/connection/queries'
import { describeConnectionString } from '@tamery/connection/utils'
import { toShell } from '@tamery/mongo/shell'
import { Dialect } from '@tamery/shared/enums/connection-type'
import type { TransactionSettings } from 'kysely'
import { memoize } from 'memoza'

import type { DialectOptions } from './driver'
import { createStatementRunner } from './driver'

/** A document as it crosses the wire: relaxed Extended JSON, so an `_id` reads `{ $oid: '…' }`. */
export type MongoDocument = Record<string, unknown>

export interface MongoFindOptions {
  limit?: number
  projection?: MongoDocument
  skip?: number
  sort?: Record<string, 1 | -1>
}

const call = (method: string, ...args: unknown[]) => {
  const passed = args.slice(
    0,
    args.findLastIndex((arg) => arg !== undefined) + 1
  )
  return `${method}(${passed.map(toShell).join(', ')})`
}

type Execute = (text: string) => Promise<ResultSet[]>

const SYSTEM_COLLECTION = /^system\./u

const reader = (execute: Execute) => ({
  affected: async (text: string) => {
    const [set] = await execute(text)
    return set?.affectedRows ?? 0
  },
  documents: async <T>(text: string) => rowObjects(await execute(text)) as T[],
  value: async <T>(text: string, column: string) => {
    const [row] = rowObjects(await execute(text))
    return row?.[column] as T
  },
})

const mongoCollection = (execute: Execute, name: string) => {
  const { affected, documents, value } = reader(execute)
  const target = `db.getCollection(${toShell(name)})`
  return {
    aggregate: <T = MongoDocument>(pipeline: MongoDocument[]) =>
      documents<T>(`${target}.${call('aggregate', pipeline)}`),
    countDocuments: (filter: MongoDocument = {}) =>
      value<number>(`${target}.${call('countDocuments', filter)}`, 'count'),
    deleteMany: (filter: MongoDocument) =>
      affected(`${target}.${call('deleteMany', filter)}`),
    drop: () => execute(`${target}.drop()`),
    estimatedDocumentCount: () =>
      value<number>(`${target}.estimatedDocumentCount()`, 'count'),
    find: <T = MongoDocument>(
      filter: MongoDocument = {},
      { limit, projection, skip, sort }: MongoFindOptions = {}
    ) =>
      documents<T>(
        [
          `${target}.${call('find', filter, projection)}`,
          sort && call('sort', sort),
          skip && call('skip', skip),
          limit && call('limit', limit),
        ]
          .filter(Boolean)
          .join('.')
      ),
    indexes: <T = MongoDocument>() => documents<T>(`${target}.getIndexes()`),
    insertMany: (rows: MongoDocument[]) =>
      affected(`${target}.${call('insertMany', rows)}`),
    rename: (to: string) =>
      execute(`${target}.${call('renameCollection', to)}`),
    updateOne: (filter: MongoDocument, update: MongoDocument) =>
      affected(`${target}.${call('updateOne', filter, update)}`),
  }
}

export type MongoCollection = ReturnType<typeof mongoCollection>

export interface MongoDatabase {
  adminCommand: <T = MongoDocument>(
    name: string,
    fields?: MongoDocument
  ) => Promise<T[]>
  collection: (name: string) => MongoCollection
  /** Without the server's own collections (`system.views`, `system.profile`, a time series' buckets). */
  collections: () => Promise<{ name: string; type: string }[]>
  /** The server reads a command's first key as its name, so the name comes apart from the options. */
  command: <T = MongoDocument>(
    name: string,
    fields?: MongoDocument
  ) => Promise<T[]>
  createCollection: (name: string) => Promise<ResultSet[]>
  createView: (
    name: string,
    source: string,
    pipeline: MongoDocument[]
  ) => Promise<ResultSet[]>
  name: string
  run: Execute
  /** On a standalone server the calls run one by one, since it has no transactions; `read only` still refuses writes. */
  transaction: (settings?: TransactionSettings & { commit?: boolean }) => {
    execute: <T>(scope: (tx: MongoDatabase) => Promise<T>) => Promise<T>
  }
}

const createMongoDatabase = (
  options: DialectOptions,
  txId: string | null
): MongoDatabase => {
  const { provider, run } = createStatementRunner(Dialect.MongoDB, options)

  const execute: Execute = async (text) => {
    const { result } = await run(
      { query: text, queryId: crypto.randomUUID(), values: [] },
      txId ?? options.txId ?? null
    )
    return result
  }

  return {
    adminCommand: (name, fields) =>
      reader(execute).documents(
        `db.${call('adminCommand', { [name]: 1, ...fields })}`
      ),
    collection: (name) => mongoCollection(execute, name),
    collections: () =>
      reader(execute).documents(
        `db.${call('getCollectionInfos', { name: { $not: SYSTEM_COLLECTION } }, { authorizedCollections: true, nameOnly: true })}`
      ),
    command: (name, fields) =>
      reader(execute).documents(
        `db.${call('runCommand', { [name]: 1, ...fields })}`
      ),
    createCollection: (name) => execute(`db.${call('createCollection', name)}`),
    createView: (name, source, pipeline) =>
      execute(`db.${call('createView', name, source, pipeline)}`),
    name:
      describeConnectionString(options.connectionString).defaultResourceName ??
      '',
    run: execute,
    transaction: ({ commit = true, ...settings } = {}) => ({
      execute: async (scope) => {
        const { txId: transactionId } =
          await provider.beginTransaction(settings)
        try {
          const result = await scope(
            createMongoDatabase(options, transactionId)
          )
          await (commit
            ? provider.commitTransaction({ txId: transactionId })
            : provider.rollbackTransaction({ txId: transactionId }))
          return result
        } catch (error) {
          await provider.rollbackTransaction({ txId: transactionId })
          throw error
        }
      },
    }),
  }
}

export const mongodbDialect = memoize(
  (options: DialectOptions) => createMongoDatabase(options, null),
  { cacheKey: ({ log: _log, ...rest }) => rest }
)
