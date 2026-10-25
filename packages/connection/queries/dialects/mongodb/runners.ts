import type { CollectionMethod, DatabaseMethod } from '@tamery/mongo/methods'
import type { MongoCall } from '@tamery/mongo/parse'
import type {
  AggregationCursor,
  AnyBulkWriteOperation,
  ClientSession,
  Collection,
  Db,
  Document,
  FindCursor,
  IndexSpecification,
  MongoClient,
} from 'mongodb'

import type { ResultSet } from '../..'
import { affected, FINISHED, value } from './result'

export type QueryCursor = AggregationCursor<Document> | FindCursor<Document>

export interface Run<Target> {
  args: unknown[]
  options: { comment?: string; session?: ClientSession }
  read: (cursor: QueryCursor) => Promise<ResultSet>
  rows: (docs: Document[]) => ResultSet
  target: Target
}

type Runner<Target> = (run: Run<Target>) => Promise<ResultSet>

export const document = (arg: unknown) => (arg ?? {}) as Document

const withOptions = (arg: unknown, { options }: Run<unknown>) => ({
  ...document(arg),
  ...options,
})

const command = (result: Document, { rows }: Run<unknown>) =>
  rows(
    Array.isArray(result.cursor?.firstBatch)
      ? result.cursor.firstBatch
      : [result]
  )

const one = (found: Document | null, { rows }: Run<unknown>) =>
  rows(found ? [found] : [])

const DATABASE_RUNNERS: Record<
  DatabaseMethod,
  Runner<{ client: MongoClient; db: Db }>
> = {
  adminCommand: async (run) =>
    command(
      await run.target.client
        .db('admin')
        .command(document(run.args[0]), run.options),
      run
    ),
  aggregate: (run) =>
    run.read(run.target.db.aggregate(run.args[0] as Document[], run.options)),
  createCollection: async (run) => {
    await run.target.db.createCollection(
      String(run.args[0]),
      withOptions(run.args[1], run)
    )
    return FINISHED
  },
  createView: async (run) => {
    const [name, source, pipeline, options] = run.args
    await run.target.db.createCollection(String(name), {
      ...withOptions(options, run),
      pipeline: (pipeline ?? []) as Document[],
      viewOn: String(source),
    })
    return FINISHED
  },
  dropDatabase: async ({ options, target }) => {
    await target.db.dropDatabase(options)
    return FINISHED
  },
  getCollectionInfos: async (run) =>
    run.rows(
      await run.target.db
        .listCollections(document(run.args[0]), withOptions(run.args[1], run))
        .toArray()
    ),
  getCollectionNames: async (run) => {
    const collections = await run.target.db
      .listCollections({}, { ...run.options, nameOnly: true })
      .toArray()
    return run.rows(collections.map(({ name }) => ({ name })))
  },
  runCommand: async (run) =>
    command(
      await run.target.db.command(document(run.args[0]), run.options),
      run
    ),
  stats: async (run) =>
    command(await run.target.db.command({ dbStats: 1 }, run.options), run),
  version: async ({ options, target }) => {
    const info = await target.db.admin().command({ buildInfo: 1 }, options)
    return value('version', info.version)
  },
}

const COLLECTION_RUNNERS: Record<CollectionMethod, Runner<Collection>> = {
  aggregate: (run) =>
    run.read(
      run.target.aggregate(
        run.args[0] as Document[],
        withOptions(run.args[1], run)
      )
    ),
  bulkWrite: async (run) => {
    const result = await run.target.bulkWrite(
      run.args[0] as AnyBulkWriteOperation[],
      withOptions(run.args[1], run)
    )
    return affected(
      result.insertedCount +
        result.modifiedCount +
        result.deletedCount +
        result.upsertedCount
    )
  },
  countDocuments: async (run) =>
    value(
      'count',
      await run.target.countDocuments(
        document(run.args[0]),
        withOptions(run.args[1], run)
      )
    ),
  createIndex: async (run) =>
    value(
      'name',
      await run.target.createIndex(
        run.args[0] as IndexSpecification,
        withOptions(run.args[1], run)
      )
    ),
  deleteMany: async (run) => {
    const result = await run.target.deleteMany(
      document(run.args[0]),
      withOptions(run.args[1], run)
    )
    return affected(result.deletedCount)
  },
  deleteOne: async (run) => {
    const result = await run.target.deleteOne(
      document(run.args[0]),
      withOptions(run.args[1], run)
    )
    return affected(result.deletedCount)
  },
  distinct: async (run) => {
    const values = await run.target.distinct(
      String(run.args[0]),
      document(run.args[1]),
      withOptions(run.args[2], run)
    )
    return run.rows(values.map((item) => ({ value: item })))
  },
  drop: async ({ options, target }) => {
    await target.drop(options)
    return FINISHED
  },
  dropIndex: async ({ args: [name], options, target }) => {
    await target.dropIndex(String(name), options)
    return FINISHED
  },
  dropIndexes: async ({ options, target }) => {
    await target.dropIndexes(options)
    return FINISHED
  },
  estimatedDocumentCount: async (run) =>
    value(
      'count',
      await run.target.estimatedDocumentCount(withOptions(run.args[0], run))
    ),
  find: (run) =>
    run.read(
      run.target.find(document(run.args[0]), {
        ...withOptions(run.args[2], run),
        projection: run.args[1] as Document | undefined,
      })
    ),
  findOne: async (run) =>
    one(
      await run.target.findOne(document(run.args[0]), {
        ...withOptions(run.args[2], run),
        projection: run.args[1] as Document | undefined,
      }),
      run
    ),
  findOneAndDelete: async (run) =>
    one(
      await run.target.findOneAndDelete(
        document(run.args[0]),
        withOptions(run.args[1], run)
      ),
      run
    ),
  findOneAndReplace: async (run) =>
    one(
      await run.target.findOneAndReplace(
        document(run.args[0]),
        document(run.args[1]),
        withOptions(run.args[2], run)
      ),
      run
    ),
  findOneAndUpdate: async (run) =>
    one(
      await run.target.findOneAndUpdate(
        document(run.args[0]),
        run.args[1] as Document,
        withOptions(run.args[2], run)
      ),
      run
    ),
  getIndexes: async (run) => run.rows(await run.target.indexes(run.options)),
  insertMany: async (run) => {
    const result = await run.target.insertMany(
      run.args[0] as Document[],
      withOptions(run.args[1], run)
    )
    return affected(result.insertedCount)
  },
  insertOne: async (run) => {
    await run.target.insertOne(
      document(run.args[0]),
      withOptions(run.args[1], run)
    )
    return affected(1)
  },
  renameCollection: async ({ args: [name, dropTarget], options, target }) => {
    await target.rename(String(name), {
      ...options,
      dropTarget: Boolean(dropTarget),
    })
    return FINISHED
  },
  replaceOne: async (run) => {
    const result = await run.target.replaceOne(
      document(run.args[0]),
      document(run.args[1]),
      withOptions(run.args[2], run)
    )
    return affected(result.modifiedCount + result.upsertedCount)
  },
  updateMany: async (run) => {
    const result = await run.target.updateMany(
      document(run.args[0]),
      run.args[1] as Document,
      withOptions(run.args[2], run)
    )
    return affected(result.modifiedCount + result.upsertedCount)
  },
  updateOne: async (run) => {
    const result = await run.target.updateOne(
      document(run.args[0]),
      run.args[1] as Document,
      withOptions(run.args[2], run)
    )
    return affected(result.modifiedCount + result.upsertedCount)
  },
}

export const runCall = (
  client: MongoClient,
  call: MongoCall,
  context: Omit<Run<unknown>, 'target'>
) => {
  const db = client.db(call.database ?? undefined)
  return call.collection === null
    ? DATABASE_RUNNERS[call.method]({ ...context, target: { client, db } })
    : COLLECTION_RUNNERS[call.method]({
        ...context,
        target: db.collection(call.collection),
      })
}
