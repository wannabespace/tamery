import { describe, expect, it } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'

import type { columnType } from '~/core/queries/tables/columns'

import type { Column } from './utils'
import {
  canWriteDefault,
  formatColumnTime,
  getColumnKind,
  getColumnUiType,
  getLocalTime,
  isComparableColumn,
  isNumericColumn,
} from './utils'

const column = (over: Partial<Column>): Column => ({
  id: 'c',
  uiType: 'raw',
  ...over,
})

const catalogColumn = (
  over: Partial<typeof columnType.infer> & { type: string }
): typeof columnType.infer => ({
  comment: null,
  default: null,
  id: 'c',
  isEditable: true,
  isGenerated: false,
  isIdentity: false,
  isNullable: true,
  schema: 's',
  table: 't',
  typeLabel: over.type,
  ...over,
})

const numeric = (type: string) => isNumericColumn(column({ type }))

const pgUiType = (over: Partial<typeof columnType.infer> & { type: string }) =>
  getColumnUiType(Dialect.Postgres, catalogColumn(over))

const pgKind = (over: Partial<Column>) =>
  getColumnKind(Dialect.Postgres, column(over))

describe('isNumericColumn', () => {
  it('matches numeric types across engines but not look-alikes', () => {
    expect(
      ['int4', 'UInt64', 'Decimal(10, 2)', 'double precision', 'money'].map(
        numeric
      )
    ).toEqual([true, true, true, true, true])
    expect(['interval', 'point', 'text', 'uuid'].map(numeric)).toEqual([
      false,
      false,
      false,
      false,
    ])
  })
})

describe('getColumnUiType', () => {
  it('reads shape before type: array and enum win', () => {
    expect(pgUiType({ isArray: true, type: 'integer' })).toBe('list')
    expect(pgUiType({ enumName: 'mood', type: 'mood' })).toBe('select')
  })

  it('classifies dates, times and timestamps from the type name', () => {
    expect(pgUiType({ type: 'timestamptz' })).toBe('datetime')
    expect(pgUiType({ type: 'timestamp' })).toBe('datetime')
    expect(pgUiType({ type: 'date' })).toBe('date')
    expect(pgUiType({ type: 'time' })).toBe('time')
  })

  it('falls back to raw for ranges and plain types', () => {
    expect(pgUiType({ type: 'int4range' })).toBe('raw')
    expect(pgUiType({ type: 'text' })).toBe('raw')
  })

  it('reads boolean from the capability, not a substring', () => {
    expect(pgUiType({ type: 'boolean' })).toBe('boolean')
    expect(
      getColumnUiType(Dialect.SQLite, catalogColumn({ type: 'text' }))
    ).toBe('raw')
  })

  it("treats Oracle's bare DATE as a datetime", () => {
    expect(
      getColumnUiType(Dialect.Oracle, catalogColumn({ type: 'DATE' }))
    ).toBe('datetime')
  })
})

describe('getColumnKind', () => {
  it('ranks key and link above the type', () => {
    expect(pgKind({ primaryKey: 'pk', type: 'jsonb' })).toBe('key')
    expect(
      pgKind({
        foreign: { column: 'id', name: 'fk', schema: 's', table: 'other' },
        type: 'integer',
      })
    ).toBe('link')
  })

  it('maps the ui type where it has one', () => {
    expect(pgKind({ type: 'boolean', uiType: 'boolean' })).toBe('boolean')
    expect(pgKind({ type: 'date', uiType: 'date' })).toBe('date')
    expect(pgKind({ type: 'timestamptz', uiType: 'datetime' })).toBe('date')
    expect(pgKind({ enumName: 'mood', type: 'mood', uiType: 'select' })).toBe(
      'select'
    )
  })

  it('classifies raw types by engine vocabulary', () => {
    expect(pgKind({ type: 'integer' })).toBe('number')
    expect(pgKind({ type: 'jsonb' })).toBe('json')
    expect(pgKind({ type: 'uuid' })).toBe('uuid')
    expect(pgKind({ type: 'bytea' })).toBe('binary')
    expect(pgKind({ type: 'text' })).toBe('text')
  })
})

describe('isComparableColumn', () => {
  it('rejects a row lookup that cannot match on `=`', () => {
    expect(isComparableColumn(Dialect.Postgres, { type: 'text' })).toBe(true)
    expect(isComparableColumn(Dialect.Postgres, { type: 'integer' })).toBe(true)
    expect(
      isComparableColumn(Dialect.Postgres, { isArray: true, type: 'integer' })
    ).toBe(false)
    expect(isComparableColumn(Dialect.Postgres, { type: 'bytea' })).toBe(false)
    expect(isComparableColumn(Dialect.Postgres, { type: 'json' })).toBe(false)
    expect(isComparableColumn(Dialect.SQLite, { type: 'blob' })).toBe(false)
    expect(isComparableColumn(Dialect.SQLite, { type: 'text' })).toBe(true)
  })
})

describe('canWriteDefault', () => {
  it('needs the capability and a present default', () => {
    expect(
      canWriteDefault(Dialect.Postgres, column({ defaultValue: '0' }))
    ).toBe(true)
    expect(
      canWriteDefault(Dialect.Postgres, column({ defaultValue: null }))
    ).toBe(false)
    expect(canWriteDefault(Dialect.Postgres, column({}))).toBe(false)
    expect(canWriteDefault(Dialect.SQLite, column({ defaultValue: '0' }))).toBe(
      false
    )
  })
})

describe('formatColumnTime', () => {
  process.env.TZ = 'Europe/Kyiv'
  const date = new Date('2026-06-20T09:30:00Z')

  it('appends the offset only for a zoned column type', () => {
    expect(
      formatColumnTime(
        date,
        'HH:mm',
        column({ type: 'timestamp' }),
        Dialect.Postgres
      )
    ).toBe('12:30')
    expect(
      formatColumnTime(
        date,
        'HH:mm',
        column({ type: 'timestamp with time zone' }),
        Dialect.Postgres
      )
    ).toBe('12:30+03:00')
  })
})

describe('getLocalTime', () => {
  process.env.TZ = 'Europe/Kyiv'

  it.each([
    ['2026-10-20 12:00:00.123456+00', '15:00:00.123456'],
    ['2026-10-20 21:30:00 -05:00', '2026-10-21 05:30:00'],
    ['2026-01-20T12:00:00Z', '14:00:00'],
    ['2026-10-20 15:00:00+03', undefined],
    ['2026-10-20 12:00:00', undefined],
    ['2026-10-20', undefined],
    ['12:00', undefined],
  ])('shows %p as %p', (stored, local) => {
    expect(getLocalTime(stored)).toBe(local)
  })

  it('reads a time without a day as today', () => {
    expect(getLocalTime('09:15:00+00')).toMatch(/^1[12]:15:00$/u)
  })
})
