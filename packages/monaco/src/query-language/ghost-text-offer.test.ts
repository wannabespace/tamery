import { describe, expect, it } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'
import { dialects } from '@tamery/sql'

import {
  needsLeadingSpace,
  typedAlong,
  withinStatement,
} from './ghost-text-offer'

const pg = dialects[Dialect.Postgres]

describe('needsLeadingSpace', () => {
  it('separates a keyword the model glued onto a finished word', () => {
    expect(
      needsLeadingSpace('select * from accounts', 'where id = 1', false, pg)
    ).toBe(true)
  })

  it('leaves word completions alone', () => {
    expect(needsLeadingSpace('sel', 'ect * from users', false, pg)).toBe(false)
    expect(needsLeadingSpace('insert in', 'to users', false, pg)).toBe(false)
    expect(
      needsLeadingSpace('select * from accounts ', 'where', false, pg)
    ).toBe(false)
  })

  it('always separates after a completion pick', () => {
    expect(needsLeadingSpace('select * from users', 'u', true, pg)).toBe(true)
    expect(needsLeadingSpace('select', '* from users', true, pg)).toBe(true)
    expect(needsLeadingSpace('select', ' * from users', true, pg)).toBe(false)
  })
})

describe('withinStatement', () => {
  it('stops at the end of the statement at the caret', () => {
    expect(
      withinStatement(
        'select * from users; select * from ',
        'accounts; select * from members;',
        pg
      )
    ).toBe('accounts;')
  })

  it('keeps a reply that never ends the statement', () => {
    expect(withinStatement('select * from ', 'users where id = 1', pg)).toBe(
      'users where id = 1'
    )
  })

  it('ignores a semicolon inside a string', () => {
    expect(withinStatement("select ';", "' as a; select 1;", pg)).toBe(
      "' as a;"
    )
  })
})

describe('typedAlong', () => {
  const offer = {
    after: ';',
    before: 'select * from ',
    text: "users where name = 'ann'",
  }

  it('keeps the rest of the offer while the user types it', () => {
    expect(typedAlong(offer, 'select * from us;', 16)).toBe(
      "ers where name = 'ann'"
    )
  })

  it('drops the offer once the user types something else', () => {
    expect(typedAlong(offer, 'select * from ac;', 16)).toBeUndefined()
  })

  it('drops the offer once it is typed in full', () => {
    const typed = `select * from ${offer.text};`
    expect(typedAlong(offer, typed, typed.length - 1)).toBeUndefined()
  })

  it('does not repeat a quote the editor auto-closed after the caret', () => {
    const typed = "select * from users where name = '';"
    expect(typedAlong(offer, typed, typed.length - 2)).toBe('ann')
  })

  it('drops the offer when the text after the caret changed', () => {
    expect(typedAlong(offer, 'select * from us limit 1;', 16)).toBeUndefined()
  })
})
