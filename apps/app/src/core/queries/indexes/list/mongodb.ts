import { toShell } from '@tamery/mongo/shell'

import type { MongoDatabase } from '~/core/runtime/dialects/mongodb'

const ID_INDEX = '_id_'
const OPTION_KEYS = [
  'unique',
  'sparse',
  'partialFilterExpression',
  'expireAfterSeconds',
  'collation',
]

interface MongoIndex {
  key: Record<string, unknown>
  name: string
  [option: string]: unknown
}

/** One row per key, in key order, as every engine's list returns them; a key's non-numeric kind (`text`, `hashed`, `2dsphere`) is its type. */
const indexRows = (schema: string, table: string, index: MongoIndex) => {
  const options = Object.fromEntries(
    OPTION_KEYS.flatMap((key) => (key in index ? [[key, index[key]]] : []))
  )
  const definition = `db.getCollection(${toShell(table)}).createIndex(${toShell(index.key)}${
    Object.keys(options).length > 0
      ? `, ${toShell({ ...options, name: index.name })}`
      : ''
  })`
  return Object.entries(index.key).map(([column, order]) => ({
    column,
    index_definition: definition,
    index_type: typeof order === 'string' ? order : undefined,
    is_custom:
      order !== 1 || Object.keys(options).some((key) => key !== 'unique'),
    is_primary: index.name === ID_INDEX,
    is_unique: index.name === ID_INDEX || index.unique === true,
    name: index.name,
    schema,
    table,
  }))
}

export const mongodbIndexes = async (db: MongoDatabase) => {
  const collections = await db.collections()
  const indexes = await Promise.all(
    collections
      .filter(({ type: kind }) => kind !== 'view')
      .map(async ({ name: table }) => {
        const list = await db.collection(table).indexes<MongoIndex>()
        return list.flatMap((index) => indexRows(db.name, table, index))
      })
  )
  return indexes.flat()
}
