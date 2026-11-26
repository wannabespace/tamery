import { describe, expect, it } from 'bun:test'

import type { EditableColumn } from './submitted-column'
import { changed, normalized } from './submitted-column'

const column: EditableColumn = {
  comment: 'kept',
  foreign: false,
  id: 'name',
  name: 'name',
  nullable: true,
  primaryKey: false,
  type: 'text',
}

const submitted = {
  name: 'name',
  nullable: true,
  primaryKey: false,
  type: 'text',
}

describe('submitted column comment', () => {
  it('leaves a hidden comment alone', () => {
    const next = normalized(column, { ...submitted, comment: { kind: 'keep' } })
    expect(next.comment).toStrictEqual({ kind: 'keep' })
    expect(changed(column, next, null)).toBe(false)
  })

  it('clears a comment emptied to whitespace', () => {
    const next = normalized(column, {
      ...submitted,
      comment: { kind: 'set', text: '  ' },
    })
    expect(next.comment).toStrictEqual({ kind: 'set', text: null })
    expect(changed(column, next, null)).toBe(true)
  })

  it('keeps an untouched comment as it is stored', () => {
    const next = normalized(column, {
      ...submitted,
      comment: { kind: 'set', text: 'kept' },
    })
    expect(changed(column, next, null)).toBe(false)
  })
})
