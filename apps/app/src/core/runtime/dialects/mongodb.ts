import type { ResultSet } from '@tamery/connection/queries'
import { rowObjects } from '@tamery/connection/queries'
import { describeConnectionString } from '@tamery/connection/utils'
import { toShell } from '@tamery/mongo/shell'
import { Dialect } from '@tamery/shared/enums/connection-type'
import { toError } from '@tamery/shared/utils'
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
  const on = (method: string, ...args: unknown[]) =>
    `${target}.${call(method, ...args)}`
  return {
    aggregate: <T = MongoDocument>(pipeline: MongoDocument[]) =>
      documents<T>(on('aggregate', pipeline)),
    countDocuments: (filter: MongoDocument = {}) =>
      value<number>(on('countDocuments', filter), 'count'),
    createIndex: (keys: MongoDocument, options: MongoDocument = {}) =>
      execute(on('createIndex', keys, options)),
    dropIndex: (indexName: string) => affected(on('dropIndex', indexName)),
    deleteMany: (filter: MongoDocument) => affected(on('deleteMany', filter)),
    drop: () => execute(on('drop')),
    estimatedDocumentCount: () =>
      value<number>(on('estimatedDocumentCount'), 'count'),
    find: <T = MongoDocument>(
      filter: MongoDocument = {},
      { limit, projection, skip, sort }: MongoFindOptions = {}
    ) =>
      documents<T>(
        [
          on('find', filter, projection),
          sort && call('sort', sort),
          skip && call('skip', skip),
          limit && call('limit', limit),
        ]
          .filter(Boolean)
          .join('.')
      ),
    indexes: <T = MongoDocument>() => documents<T>(on('getIndexes')),
    insertMany: (rows: MongoDocument[]) => affected(on('insertMany', rows)),
    rename: (to: string) => execute(on('renameCollection', to)),
    updateOne: (filter: MongoDocument, update: MongoDocument) =>
      affected(on('updateOne', filter, update)),
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
    try {
      const { result } = await run(
        { query: text, queryId: crypto.randomUUID(), values: [] },
        txId ?? options.txId ?? null
      )
      return result
    } catch (error) {
      // A server or driver error arrives without a stack, so the failing statement is the only pointer to what ran.
      const wrapped = toError(error)
      wrapped.cause ??= `Failed statement:\n${text}`
      throw wrapped
    }
  }

  return {
    adminCommand: (name, fields) =>
      reader(execute).documents(
        `db.${call('adminCommand', { [name]: 1, ...fields })}`
      ),
    collection: (name) => mongoCollection(execute, name),
    // The server's own collections are dropped here, not through a `$not` regex filter a strict server (DocumentDB, FerretDB) refuses.
    collections: async () => {
      const infos = await reader(execute).documents<{
        name: string
        type: string
      }>(
        `db.${call('getCollectionInfos', {}, { authorizedCollections: true, nameOnly: true })}`
      )
      return infos.filter(({ name }) => !name.startsWith('system.'))
    },
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
