import type { MongoDatabase } from '~/core/runtime/dialects/mongodb'

import type { ColumnsFilter } from '../shape'

const SAMPLE_SIZE = 100

const NUMBER_TYPES = new Set(['double', 'int', 'long'])

const ID_FIELD = '_id'

interface FieldType {
  _id: { field: string; type: string }
  count: number
  position: number
}

/** BSON's internal Timestamp would read as a date column; it edits as the Extended JSON it arrives in. */
const AS_JSON = new Set(['null', 'timestamp'])

const fieldTypeOf = (types: FieldType[]) => {
  const names = new Set(
    types.map(({ _id }) => _id.type).filter((name) => name !== 'null')
  )
  const [only] = names
  if (names.size === 1 && only && !AS_JSON.has(only)) {
    return only
  }
  return names.size > 1 && [...names].every((name) => NUMBER_TYPES.has(name))
    ? 'double'
    : 'mixed'
}

const idColumn = (schema: string, table: string) => ({
  comment: null,
  default: null,
  editable: false,
  id: ID_FIELD,
  isIdentity: true,
  nullable: false,
  schema,
  table,
  type: 'objectId',
})

const collectionColumns = async (
  db: MongoDatabase,
  schema: string,
  table: string
) => {
  const types = await db.collection(table).aggregate<FieldType>([
    { $sample: { size: SAMPLE_SIZE } },
    { $project: { field: { $objectToArray: '$$ROOT' } } },
    { $unwind: { includeArrayIndex: 'position', path: '$field' } },
    {
      $group: {
        _id: { field: '$field.k', type: { $type: '$field.v' } },
        count: { $sum: 1 },
        position: { $min: '$position' },
      },
    },
  ])
  const fields = Object.entries(Object.groupBy(types, ({ _id }) => _id.field))
  const columns = fields
    .map(([field, fieldTypes = []]) => ({
      comment: null,
      default: null,
      editable: field !== ID_FIELD,
      id: field,
      isIdentity: field === ID_FIELD,
      nullable: field !== ID_FIELD,
      position: Math.min(...fieldTypes.map(({ position }) => position)),
      schema,
      table,
      type: fieldTypeOf(fieldTypes),
    }))
    .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map(({ position: _position, ...column }) => column)
  // An empty collection samples no documents, so _id never surfaces; without it
  // the grid has no primary-key column and the first insert is unreachable.
  return columns.some((column) => column.id === ID_FIELD)
    ? columns
    : [idColumn(schema, table), ...columns]
}

export const mongodbColumns = async (
  db: MongoDatabase,
  filter: ColumnsFilter
) => {
  if (filter) {
    return collectionColumns(db, db.name, filter.table)
  }
  const collections = await db.collections()
  const columns = await Promise.all(
    collections.map(({ name }) => collectionColumns(db, db.name, name))
  )
  return columns.flat()
}
