import { describe, expect, it } from 'bun:test'

import { parseScript } from './parse'
import { toShell } from './shell'

describe('toShell', () => {
  it('writes a date whose millis are not an integer as a plain value', () => {
    const value = { $date: { $numberLong: 'not a number' } }
    const calls = parseScript(
      `db.c.updateOne({}, { $set: { a: ${toShell(value)} } })`
    )
    expect(calls.map((call) => call.method)).toStrictEqual(['updateOne'])
  })
})
