import { describe, expect, it } from 'bun:test'

import { fromWire, toWire } from './values'

describe('grid values', () => {
  it.each([
    [
      'objectId',
      { $oid: '6ad7b564729d8ccee1efdaed' },
      '6ad7b564729d8ccee1efdaed',
    ],
    ['date', { $date: '2024-01-01T00:00:00.000Z' }, '2024-01-01T00:00:00.000Z'],
    ['decimal', { $numberDecimal: '9.50' }, '9.50'],
    ['long', { $numberLong: '9007199254740993' }, '9007199254740993'],
  ])(
    'shows a %s plainly and stores it back as the same type',
    (bsonType, wire, shown) => {
      expect(fromWire(wire)).toBe(shown)
      expect(toWire(bsonType, fromWire(wire))).toStrictEqual(wire)
    }
  )

  it('keeps nested Extended JSON for the JSON editor', () => {
    const nested = { owner: { $oid: '6ad7b564729d8ccee1efdaed' } }
    expect(fromWire(nested)).toBe(nested)
  })

  it('stores text typed into number and boolean fields as their types', () => {
    expect(toWire('double', '1.5')).toBe(1.5)
    expect(toWire('bool', 'false')).toBe(false)
    expect(toWire('string', '1.5')).toBe('1.5')
  })
})
