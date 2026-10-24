import type { ColumnKind } from '@tamery/shared/column-kind'
import type { Dialect } from '@tamery/shared/enums/connection-type'
import { format, isValid, parseISO } from 'date-fns'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { columnType } from '~/core/queries/tables/columns'

export interface Column extends Partial<
  Pick<
    typeof columnType.infer,
    'attributes' | 'collation' | 'comment' | 'declaredType'
  >
> {
  id: string
  uiType: 'select' | 'list' | 'boolean' | 'date' | 'time' | 'datetime' | 'raw'
  type?: string
  typeLabel?: string
  declaredType?: string | null
  enumName?: string
  availableValues?: string[]
  isArray?: boolean
  isEditable?: boolean
  isNullable?: boolean
  maxLength?: number | null
  precision?: number | null
  scale?: number | null
  unique?: string
  primaryKey?: string
  isGenerated?: boolean
  isIdentity?: boolean
  defaultValue?: string | null
  foreign?: {
    name: string
    schema: string
    table: string
    column: string
    onDelete?: string
    onUpdate?: string
  }
  references?: {
    name: string
    schema: string
    table: string
    column: string
    isUnique?: boolean
  }[]
}

export const TIME_FORMATS: Partial<Record<Column['uiType'], string>> = {
  date: 'yyyy-MM-dd',
  datetime: 'yyyy-MM-dd HH:mm:ss',
  time: 'HH:mm:ss',
}

/** Local wall-clock text, with the offset only where the column stores a time zone. */
export const formatColumnTime = (
  date: Date,
  pattern: string,
  column: Column,
  dialect: Dialect
) =>
  format(
    date,
    getCapabilities(dialect).columnTypes.zoned?.test(column.type ?? '')
      ? `${pattern}xxx`
      : pattern
  )

const ZONED_TIME_TEXT =
  /^(?:(?<day>\d{4}-\d{2}-\d{2})[ T])?(?<minutes>\d{2}:\d{2})(?<seconds>:\d{2}(?:\.\d+)?)?\s?(?:Z|(?<zoneHours>[+-]\d{2}):?(?<zoneMinutes>\d{2})?)$/iu

/** The viewer's wall-clock text for a time stored with an offset other than theirs, dated only when the day differs. */
export const getLocalTime = (value: unknown) => {
  const groups =
    typeof value === 'string' && ZONED_TIME_TEXT.exec(value.trim())?.groups
  if (!groups) {
    return
  }
  const {
    day,
    minutes,
    seconds = '',
    zoneHours = '+00',
    zoneMinutes = '00',
  } = groups
  const offset = `${zoneHours}:${zoneMinutes}`
  const date = parseISO(
    `${day ?? format(new Date(), 'yyyy-MM-dd')}T${minutes}${seconds}${offset}`
  )
  if (!isValid(date) || format(date, 'xxx') === offset) {
    return
  }
  const sameDay = !day || format(date, 'yyyy-MM-dd') === day
  return `${format(date, sameDay ? 'HH:mm' : 'yyyy-MM-dd HH:mm')}${seconds}`
}

const SELECT_COLUMN_ID = '!__(selection_column)__!'
const ACTIONS_COLUMN_ID = '!__(actions_column)__!'

export const INTERNAL_COLUMN_IDS = {
  ACTIONS: ACTIONS_COLUMN_ID,
  SELECT: SELECT_COLUMN_ID,
}

export const rowSelectId = (rowIndex: number) => `row-select-${rowIndex}`

export const getColumnUiType = (
  dialect: Dialect,
  column: typeof columnType.infer
): Column['uiType'] => {
  if (column.isArray) {
    return 'list'
  }

  if (column.enumName) {
    return 'select'
  }

  if (getCapabilities(dialect).columnTypes.boolean?.test(column.typeLabel)) {
    return 'boolean'
  }

  if (column.type.toLowerCase().includes('range')) {
    return 'raw'
  }

  if (
    column.type.toLowerCase().includes('datetime') ||
    column.type.toLowerCase().includes('timestamp') ||
    getCapabilities(dialect).columnTypes.datesWithTime?.test(column.type)
  ) {
    return 'datetime'
  }

  if (column.type.toLowerCase().includes('date')) {
    return 'date'
  }

  if (column.type.toLowerCase().includes('time')) {
    return 'time'
  }

  return 'raw'
}

const NUMERIC_TYPE_REGEX =
  /^(?:u?int\d*|tinyint|smallint|mediumint|bigint|integer|numeric|decimal|float\d*|double|real|money|smallmoney|serial|bigserial|smallserial|number)\b/iu

export const isNumericColumn = (column: Column) =>
  column.uiType === 'raw' && NUMERIC_TYPE_REGEX.test(column.type ?? '')

const UI_TYPE_KINDS: Partial<Record<Column['uiType'], ColumnKind>> = {
  boolean: 'boolean',
  date: 'date',
  datetime: 'date',
  list: 'list',
  select: 'select',
  time: 'time',
}

const BINARY_TYPE_REGEX = /blob|binary|bytea/u

export const getColumnKind = (dialect: Dialect, column: Column): ColumnKind => {
  if (column.primaryKey) {
    return 'key'
  }
  if (column.foreign) {
    return 'link'
  }
  const uiTypeKind = UI_TYPE_KINDS[column.uiType]
  if (uiTypeKind) {
    return uiTypeKind
  }
  if (isNumericColumn(column)) {
    return 'number'
  }
  const { json, xml } = getCapabilities(dialect).columnTypes
  const type = column.type?.toLowerCase() ?? ''
  if (json.test(type) || xml?.test(type)) {
    return 'json'
  }
  if (type.includes('uuid') || type.includes('uniqueidentifier')) {
    return 'uuid'
  }
  if (BINARY_TYPE_REGEX.test(type)) {
    return 'binary'
  }
  return 'text'
}

// A write finds a row by `col = value`; these reject `=`, compare something else, or arrive as bytes that may not bind back.
export const isComparableColumn = (
  dialect: Dialect,
  column: Pick<Column, 'isArray' | 'type'>
) => {
  const { bytes, incomparable } = getCapabilities(dialect).columnTypes
  const type = column.type ?? ''
  return !(column.isArray || bytes?.test(type) || incomparable?.test(type))
}

export const hasTabularFigures = (column: Column) =>
  column.uiType !== 'raw' || isNumericColumn(column)

export const canWriteDefault = (dialect: Dialect, column: Column) =>
  getCapabilities(dialect).flags.includes('setDefault') &&
  column.defaultValue !== null &&
  column.defaultValue !== undefined
