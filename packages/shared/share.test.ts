import { describe, expect, it } from 'bun:test'

import { ShareRefresh } from './enums/share-refresh'
import { NEW_SHARE, shareSaveInput } from './share'

const SHARE_ID = '0195b1a8-7c2e-7000-8000-000000000001'

const wire = {
  columnTypes: [{ id: 'name', type: 'text' }],
  columns: [{ id: 'name', kind: 'text', type: 'text' }],
  connectionResourceId: '0195b1a8-7c2e-7000-8000-000000000002',
  description: null,
  expiresAt: null,
  filters: [],
  maxRows: 100,
  name: 'Users',
  orderBy: {},
  refresh: ShareRefresh.Hour,
  schema: 'public',
  table: 'users',
}

describe('shareSaveInput', () => {
  it('reads a left-out id as a new share and a left-out password as kept', () => {
    expect(shareSaveInput.assert(wire)).toMatchObject({
      id: NEW_SHARE,
      password: { kind: 'keep' },
    })
  })

  it('reads a sent id and password as given, and null as no password', () => {
    expect(
      shareSaveInput.assert({ ...wire, id: SHARE_ID, password: 'secret123' })
    ).toMatchObject({
      id: SHARE_ID,
      password: { kind: 'set', password: 'secret123' },
    })
    expect(shareSaveInput.assert({ ...wire, password: null })).toMatchObject({
      password: { kind: 'set', password: null },
    })
  })
})
