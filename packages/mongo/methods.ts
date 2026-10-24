/**
 * `read` never changes anything; `insert` only adds data, `write` changes or removes it; `create` adds to the catalog,
 * `drop` changes or removes catalog objects. `command` runs whatever the document names, so it counts as every effect.
 */
export type MethodEffect =
  | 'command'
  | 'create'
  | 'drop'
  | 'insert'
  | 'read'
  | 'write'

export interface MongoMethod {
  effect: MethodEffect
  signature: string
  snippet: string
}

const method = (
  effect: MethodEffect,
  signature: string,
  snippet: string
): MongoMethod => ({ effect, signature, snippet })

export const DATABASE_METHODS = {
  adminCommand: method(
    'command',
    'adminCommand(command)',
    'adminCommand({ $0 })'
  ),
  aggregate: method('read', 'aggregate(pipeline)', 'aggregate([$0])'),
  createCollection: method(
    'create',
    'createCollection(name, options)',
    "createCollection('$0')"
  ),
  createView: method(
    'create',
    'createView(name, source, pipeline)',
    "createView('$1', '$2', [$0])"
  ),
  dropDatabase: method('drop', 'dropDatabase()', 'dropDatabase()'),
  getCollectionInfos: method(
    'read',
    'getCollectionInfos(filter, options)',
    'getCollectionInfos($0)'
  ),
  getCollectionNames: method(
    'read',
    'getCollectionNames()',
    'getCollectionNames()'
  ),
  runCommand: method('command', 'runCommand(command)', 'runCommand({ $0 })'),
  stats: method('read', 'stats()', 'stats()'),
  version: method('read', 'version()', 'version()'),
} satisfies Record<string, MongoMethod>

export const COLLECTION_METHODS = {
  aggregate: method('read', 'aggregate(pipeline, options)', 'aggregate([$0])'),
  bulkWrite: method(
    'write',
    'bulkWrite(operations, options)',
    'bulkWrite([$0])'
  ),
  countDocuments: method(
    'read',
    'countDocuments(filter, options)',
    'countDocuments({$0})'
  ),
  createIndex: method(
    'create',
    'createIndex(keys, options)',
    'createIndex({ $0 })'
  ),
  deleteMany: method(
    'write',
    'deleteMany(filter, options)',
    'deleteMany({ $0 })'
  ),
  deleteOne: method('write', 'deleteOne(filter, options)', 'deleteOne({ $0 })'),
  distinct: method(
    'read',
    'distinct(field, filter, options)',
    "distinct('$0')"
  ),
  drop: method('drop', 'drop()', 'drop()'),
  dropIndex: method('drop', 'dropIndex(name)', "dropIndex('$0')"),
  dropIndexes: method('drop', 'dropIndexes()', 'dropIndexes()'),
  estimatedDocumentCount: method(
    'read',
    'estimatedDocumentCount(options)',
    'estimatedDocumentCount()'
  ),
  find: method('read', 'find(filter, projection, options)', 'find({$0})'),
  findOne: method(
    'read',
    'findOne(filter, projection, options)',
    'findOne({$0})'
  ),
  findOneAndDelete: method(
    'write',
    'findOneAndDelete(filter, options)',
    'findOneAndDelete({ $0 })'
  ),
  findOneAndReplace: method(
    'write',
    'findOneAndReplace(filter, replacement, options)',
    'findOneAndReplace({ $1 }, { $0 })'
  ),
  findOneAndUpdate: method(
    'write',
    'findOneAndUpdate(filter, update, options)',
    'findOneAndUpdate({ $1 }, { \\$set: { $0 } })'
  ),
  getIndexes: method('read', 'getIndexes()', 'getIndexes()'),
  insertMany: method(
    'insert',
    'insertMany(documents, options)',
    'insertMany([$0])'
  ),
  insertOne: method(
    'insert',
    'insertOne(document, options)',
    'insertOne({ $0 })'
  ),
  renameCollection: method(
    'drop',
    'renameCollection(name, dropTarget)',
    "renameCollection('$0')"
  ),
  replaceOne: method(
    'write',
    'replaceOne(filter, replacement, options)',
    'replaceOne({ $1 }, { $0 })'
  ),
  updateMany: method(
    'write',
    'updateMany(filter, update, options)',
    'updateMany({ $1 }, { \\$set: { $0 } })'
  ),
  updateOne: method(
    'write',
    'updateOne(filter, update, options)',
    'updateOne({ $1 }, { \\$set: { $0 } })'
  ),
} satisfies Record<string, MongoMethod>

/** Chained after `find` or `aggregate`; `toArray` and `pretty` change nothing and are accepted so pasted shell code runs. */
export const CURSOR_METHODS = {
  allowDiskUse: method('read', 'allowDiskUse()', 'allowDiskUse()'),
  batchSize: method('read', 'batchSize(size)', 'batchSize($0)'),
  collation: method('read', 'collation(collation)', 'collation({ $0 })'),
  comment: method('read', 'comment(text)', "comment('$0')"),
  explain: method('read', 'explain(verbosity)', 'explain()'),
  hint: method('read', 'hint(index)', 'hint({ $0 })'),
  limit: method('read', 'limit(count)', 'limit($0)'),
  maxTimeMS: method('read', 'maxTimeMS(milliseconds)', 'maxTimeMS($0)'),
  pretty: method('read', 'pretty()', 'pretty()'),
  project: method('read', 'project(projection)', 'project({ $0 })'),
  projection: method('read', 'projection(projection)', 'projection({ $0 })'),
  skip: method('read', 'skip(count)', 'skip($0)'),
  sort: method('read', 'sort(sort)', 'sort({ $0 })'),
  toArray: method('read', 'toArray()', 'toArray()'),
} satisfies Record<string, MongoMethod>

export type DatabaseMethod = keyof typeof DATABASE_METHODS
export type CollectionMethod = keyof typeof COLLECTION_METHODS
export type CursorMethod = keyof typeof CURSOR_METHODS
