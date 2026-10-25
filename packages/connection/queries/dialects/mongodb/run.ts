import type { CursorMethod } from '@tamery/mongo/methods'
import type { MongoCall } from '@tamery/mongo/parse'
import { getEffect, parseScript } from '@tamery/mongo/parse'
import type { Expression } from 'acorn'
import type {
  ClientSession,
  CollationOptions,
  Document,
  ExplainVerbosityLike,
  MongoClient,
} from 'mongodb'

import type { ResultSet, RunOptions } from '../..'
import { cancellable } from '../../cancellation'
import { parseShellValue } from './client'
import { rowsOf } from './result'
import type { QueryCursor } from './runners'
import { document, runCall } from './runners'

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
  // The parser allows these after aggregate() too, where they do not exist; `in` narrows to the find() cursor that has them.
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

// One document past maxRows lets resultSet flag truncation; closing the cursor stops the read without side effects.
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

// getEffect reads syntax only, so a $out/$merge assembled from BSON constructors slips past it; scanning the evaluated pipeline catches it before a read-only run.
const writesWhenRun = (call: MongoCall, args: unknown[]) =>
  getEffect(call) !== 'read' ||
  (call.method === 'aggregate' && args.some(hasWriteStage))

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

  // The query id rides along as each call's comment, so currentOp can find the operation to kill.
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
    // oxlint-disable-next-line no-await-in-loop -- statements run in order, like the shell
    const set = await cancellable({ cancel, connectionString, queryId }, () =>
      runCall(client, call, context)
    )
    result.push(set)
  }
  return { duration: performance.now() - start, result }
}
