import { describe, expect, it } from 'bun:test'

import { toShell } from '@tamery/mongo/shell'

import { mongodb, parseShellValue } from './client'

const { EJSON } = mongodb.BSON

describe('values the app writes as mongosh', () => {
  it.each([
    ['ObjectId', { $oid: '6ad7b564729d8ccee1efdaed' }],
    ['date', { $date: '2024-01-01T00:00:00Z' }],
    ['date before 1970', { $date: { $numberLong: '-86400000' } }],
    ['Long', { $numberLong: '9007199254740993' }],
    ['Decimal128', { $numberDecimal: '9.50' }],
    ['Int32', { $numberInt: '7' }],
    [
      'UUID',
      { $binary: { base64: 'Djx6xopvTzadnCtPHQubLA==', subType: '04' } },
    ],
    ['Timestamp', { $timestamp: { i: 2, t: 1 } }],
    ['regex', { $regularExpression: { options: 'i', pattern: '^a"b' } }],
    ['MinKey', { $minKey: 1 }],
    [
      'nested document',
      { 'a.b': [1, 'x', null, { $oid: '6ad7b564729d8ccee1efdaed' }] },
    ],
  ])('reads a %s back as the same BSON value', (_name, wire) => {
    const parsed = parseShellValue(toShell(wire), { mode: 'loose' })
    expect(
      EJSON.serialize({ value: parsed }, { legacy: false, relaxed: false })
        .value
    ).toStrictEqual(
      EJSON.serialize(EJSON.deserialize({ value: wire }, { relaxed: false }), {
        relaxed: false,
      }).value
    )
  })
})
