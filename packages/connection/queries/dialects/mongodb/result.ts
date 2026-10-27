import type { Document } from 'mongodb'

import type { ResultSet } from '../..'
import { resultSet } from '../..'
import { mongodb } from './client'

const { EJSON, Long } = mongodb.BSON

// Relaxed Extended JSON turns a 64-bit Long into a double, so an `_id` past 2^53 reads back changed and an edit or delete would hit the wrong document. Pre-wrapping each Long keeps it exact; other BSON types are left for the serializer.
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

const toWire = (value: unknown) =>
  EJSON.serialize({ value: keepLongs(value) }, { relaxed: true }).value

export const value = (column: string, result: unknown): ResultSet => ({
  affectedRows: null,
  columns: [column],
  rows: [[toWire(result)]],
  truncated: false,
})

export const affected = (count: number): ResultSet => ({
  affectedRows: count,
  columns: [],
  rows: [],
  truncated: false,
})

export const FINISHED: ResultSet = {
  affectedRows: null,
  columns: [],
  rows: [],
  truncated: false,
}

export const rowsOf = (docs: Document[], maxRows: number): ResultSet => {
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
