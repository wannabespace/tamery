import type { Document } from 'mongodb'

import type { ResultSet } from '../..'
import { NO_ROW_COUNT, resultSet } from '../..'
import { mongodb } from './client'

const { Double, EJSON, Long } = mongodb.BSON

// Rows are read with `promoteValues: false`, and relaxed Extended JSON writes an integral Double and a Long as plain numbers:
// `toShell` would write the Double back as Int32, and a Long past 2^53 would read back changed, so an edit or delete
// would hit the wrong document. Both stay typed; every other value goes out relaxed.
const keepTypes = (value: unknown): unknown => {
  if (value instanceof Long && !Number.isSafeInteger(value.toNumber())) {
    return { $numberLong: value.toString() }
  }
  if (value instanceof Double && Number.isInteger(value.value)) {
    return EJSON.serialize(value, { relaxed: false })
  }
  if (Array.isArray(value)) {
    return value.map(keepTypes)
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    value.constructor === Object
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, keepTypes(inner)])
    )
  }
  return value
}

const toWire = (value: unknown) =>
  EJSON.serialize({ value: keepTypes(value) }, { relaxed: true }).value

export const value = (column: string, result: unknown): ResultSet => ({
  affectedRows: NO_ROW_COUNT,
  columns: [column],
  rows: [[toWire(result)]],
  truncated: false,
})

export const affected = (count: number): ResultSet => ({
  // Under `promoteValues: false` a delete's count arrives as an Int32, whatever its type says.
  affectedRows: Number(count),
  columns: [],
  rows: [],
  truncated: false,
})

export const FINISHED: ResultSet = {
  affectedRows: NO_ROW_COUNT,
  columns: [],
  rows: [],
  truncated: false,
}

export const rowsOf = (docs: Document[], maxRows: number): ResultSet => {
  const columns = [...new Set(docs.flatMap((doc) => Object.keys(doc)))]
  return resultSet(
    {
      affectedRows: NO_ROW_COUNT,
      columns,
      rows: docs.map((doc) => columns.map((column) => toWire(doc[column]))),
    },
    maxRows
  )
}
