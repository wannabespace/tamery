import type {
  CollectionMethod,
  CursorMethod,
  DatabaseMethod,
} from '@tamery/mongo/methods'
import type { MongoCall } from '@tamery/mongo/parse'
import { getEffect, parseScript } from '@tamery/mongo/parse'
import type { Expression } from 'acorn'
import type {
  AggregationCursor,
  AnyBulkWriteOperation,
  ClientSession,
  Collection,
  CollationOptions,
  Db,
  Document,
  ExplainVerbosityLike,
  FindCursor,
  IndexSpecification,
  MongoClient,
} from 'mongodb'

import type { ResultSet, RunOptions } from '../..'
import { resultSet } from '../..'
import { cancellable } from '../../cancellation'
import { mongodb, parseShellValue } from './client'

const { EJSON, Long } = mongodb.BSON

/**
 * Relaxed Extended JSON would turn a 64-bit `NumberLong` into a double, so an `_id` past 2^53 would read back a different
 * number and an edit or delete would target the wrong document; pre-wrapping each Long keeps it exact while every other
 * scalar stays plain. BSON types (ObjectId, Decimal128, Date…) are left for the serializer; only plain documents recurse.
 */
const keepLongs = (value: unknown): unknown => {
  if (value instanceof Long) {
    return { $numberLong: value.toString() }
  }
  if (Array.isArray(value)) {
    return value.map(keepLongs)
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    value.constructor === Object
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, keepLongs(inner)])
    )
  }
  return value
}

/** Values cross IPC and HTTP as relaxed Extended JSON, which keeps an ObjectId or Decimal128 its type and a scalar plain. */
const toWire = (value: unknown) =>
  EJSON.serialize({ value: keepLongs(value) }, { relaxed: true }).value

const value = (column: string, result: unknown): ResultSet => ({
  affectedRows: null,
  columns: [column],
  rows: [[toWire(result)]],
  truncated: false,
})

const affected = (count: number): ResultSet => ({
  affectedRows: count,
  columns: [],
  rows: [],
  truncated: false,
})

const FINISHED: ResultSet = {
  affectedRows: null,
  columns: [],
  rows: [],
  truncated: false,
}

const document = (arg: unknown) => (arg ?? {}) as Document

type QueryCursor = AggregationCursor<Document> | FindCursor<Document>

interface Run<Target> {
  args: unknown[]
  options: { comment?: string; session?: ClientSession }
  read: (cursor: QueryCursor) => Promise<ResultSet>
  rows: (docs: Document[]) => ResultSet
  target: Target
}

type Runner<Target> = (run: Run<Target>) => Promise<ResultSet>

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

const evaluate = (text: string, node: Expression) => {
  const source = text.slice(node.start, node.end)
  const parsed: unknown = parseShellValue(source, { mode: 'loose' })
  // The parser answers an expression it refuses (a function, a variable) with an empty string instead of throwing.
  if (
    parsed === '' &&
    !(node.type === 'Literal' || node.type === 'TemplateLiteral')
  ) {
    throw new Error(
      `Tamery cannot evaluate \`${source}\`: use literal values and BSON constructors like ObjectId().`
    )
  }
  return parsed
}

const rowsOf = (docs: Document[], maxRows: number): ResultSet => {
  const columns = [...new Set(docs.flatMap((doc) => Object.keys(doc)))]
  return resultSet(
    {
      affectedRows: null,
      columns,
      rows: docs.map((doc) => columns.map((column) => toWire(doc[column]))),
    },
    maxRows
  )
}

/** Keeps one document past `maxRows`, then closes the cursor: a read stops there without side effects. */
const readCursor = async (cursor: QueryCursor, maxRows: number) => {
  const docs: Document[] = []
  for await (const doc of cursor) {
    docs.push(doc)
    if (docs.length > maxRows) {
      break
    }
  }
  await cursor.close()
  return rowsOf(docs, maxRows)
}

const EXPLAIN_VERBOSITY: Record<string, ExplainVerbosityLike> = {
  allPlansExecution: 'allPlansExecution',
  executionStats: 'executionStats',
  queryPlanner: 'queryPlanner',
  queryPlannerExtended: 'queryPlannerExtended',
}

const verbosityOf = (arg: unknown): ExplainVerbosityLike | undefined => {
  if (typeof arg === 'boolean') {
    return arg
  }
  return typeof arg === 'string' ? EXPLAIN_VERBOSITY[arg] : undefined
}

const collationOf = (arg: unknown): CollationOptions => {
  const options = document(arg)
  if (typeof options.locale !== 'string') {
    throw new TypeError('.collation() needs a locale.')
  }
  return { ...options, locale: options.locale }
}

const applyStep = (cursor: QueryCursor, method: CursorMethod, arg: unknown) => {
  switch (method) {
    case 'limit': {
      return cursor.limit(Number(arg))
    }
    case 'project':
    case 'projection': {
      return cursor.project(document(arg))
    }
    case 'skip': {
      return cursor.skip(Number(arg))
    }
    case 'sort': {
      // oxlint-disable-next-line no-array-sort -- a result cursor's sort(), not Array#sort()
      return cursor.sort(document(arg))
    }
    default: {
      break
    }
  }
  // `in` narrows to a find() cursor; the parser allows these after aggregate() too, where they do not apply.
  if ('allowDiskUse' in cursor) {
    switch (method) {
      case 'allowDiskUse': {
        return cursor.allowDiskUse(arg !== false)
      }
      case 'batchSize': {
        return cursor.batchSize(Number(arg))
      }
      case 'collation': {
        return cursor.collation(collationOf(arg))
      }
      case 'comment': {
        return cursor.comment(String(arg))
      }
      case 'hint': {
        return cursor.hint(document(arg))
      }
      case 'maxTimeMS': {
        return cursor.maxTimeMS(Number(arg))
      }
      default: {
        break
      }
    }
  }
  throw new TypeError(`.${method}() does not apply to this cursor.`)
}

const chained =
  (call: MongoCall, text: string, maxRows: number) =>
  async (cursor: QueryCursor) => {
    const explain = call.cursor.find(({ method }) => method === 'explain')
    for (const { args, method } of call.cursor) {
      if (method === 'explain' || method === 'pretty' || method === 'toArray') {
        continue
      }
      applyStep(cursor, method, args[0] && evaluate(text, args[0]))
    }
    if (!explain) {
      return readCursor(cursor, maxRows)
    }
    const verbosity = verbosityOf(
      explain.args[0] && evaluate(text, explain.args[0])
    )
    const plan = await (verbosity === undefined
      ? cursor.explain()
      : cursor.explain(verbosity))
    return rowsOf([plan], maxRows)
  }

const WRITE_STAGES = new Set(['$merge', '$out'])

/** A pipeline stage can be assembled from BSON constructors, so the write check reads the evaluated value, not its source. */
const hasWriteStage = (node: unknown): boolean => {
  if (Array.isArray(node)) {
    return node.some(hasWriteStage)
  }
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).some(
      ([key, inner]) => WRITE_STAGES.has(key) || hasWriteStage(inner)
    )
  }
  return false
}

// `getEffect` reads the syntax, which can miss a `$out` the pipeline only names once evaluated; the BSON scan catches it.
const writesWhenRun = (call: MongoCall, args: unknown[]) =>
  getEffect(call) !== 'read' ||
  (call.method === 'aggregate' && args.some(hasWriteStage))

const runCall = (
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

export const runScript = async (
  client: MongoClient,
  {
    connectionString,
    readOnly,
    session,
    text,
  }: {
    connectionString: string
    readOnly: boolean
    session?: ClientSession
    text: string
  },
  { maxRows = Infinity, queryId }: RunOptions
) => {
  const prepared = parseScript(text).map((call) => ({
    args: call.args.map((arg) => evaluate(text, arg)),
    call,
  }))
  const writing = readOnly
    ? prepared.find(({ args, call }) => writesWhenRun(call, args))
    : undefined
  if (writing) {
    throw new Error(
      `This runs read-only, and ${writing.call.method}() can change data.`
    )
  }

  // Every call carries the query id as its comment, which is how a cancel finds the operation to kill.
  const cancel = async () => {
    const admin = client.db('admin')
    const ownOperation = { $ownOps: true, 'command.comment': queryId }
    // A command's name must be its first key.
    const { inprog } = await admin.command({ currentOp: 1, ...ownOperation })
    await Promise.all(
      (inprog as Document[]).map(({ opid }) =>
        admin.command({ killOp: 1, op: opid })
      )
    )
  }
  const options = {
    ...(queryId && { comment: queryId }),
    ...(session && { session }),
  }

  const start = performance.now()
  const result: ResultSet[] = []
  for (const { args, call } of prepared) {
    const context = {
      args,
      options,
      read: chained(call, text, maxRows),
      rows: (docs: Document[]) => rowsOf(docs, maxRows),
    }
    // Statements run in order, as the shell runs them.
    // oxlint-disable-next-line no-await-in-loop
    const set = await cancellable({ cancel, connectionString, queryId }, () =>
      runCall(client, call, context)
    )
    result.push(set)
  }
  return { duration: performance.now() - start, result }
}
