import { describe, expect, it } from 'bun:test'

import type { ResultSet } from '~/core/queries/connection/custom'

import { resultGrid, uniqueColumns } from './result-grid'

const set = (over: Partial<ResultSet>): ResultSet => ({
  affectedRows: null,
  columns: [],
  rows: [],
  truncated: false,
  ...over,
})

describe('uniqueColumns', () => {
  it('suffixes repeats so duplicate names stay addressable', () => {
    expect(uniqueColumns(['id', 'name', 'id', 'id'])).toEqual([
      'id',
      'name',
      'id (2)',
      'id (3)',
    ])
  })
})

describe('resultGrid', () => {
  it('returns an empty grid for no set', () => {
    expect(resultGrid(null, '')).toEqual({ columns: [], rows: [] })
  })

  it('zips rows into records keyed by the de-duplicated columns', () => {
    expect(
      resultGrid(
        set({
          columns: ['id', 'name'],
          rows: [
            [1, 'Ann'],
            [2, 'Bob'],
          ],
        }),
        ''
      )
    ).toEqual({
      columns: ['id', 'name'],
      rows: [
        { id: 1, name: 'Ann' },
        { id: 2, name: 'Bob' },
      ],
    })
  })

  it('filters by a case-insensitive match on any value', () => {
    const grid = resultGrid(
      set({
        columns: ['id', 'name'],
        rows: [
          [1, 'Ann'],
          [2, 'Bob'],
        ],
      }),
      'bob'
    )
    expect(grid.rows).toEqual([{ id: 2, name: 'Bob' }])
  })
})
