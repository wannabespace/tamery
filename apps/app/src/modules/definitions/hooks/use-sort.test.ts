import { describe, expect, it } from 'bun:test'

import type { DefinitionsColumn } from '../lib/columns'
import { nextSort, sortRows } from './use-sort'

interface Row {
  group: string
  name: string
  size?: number
}

const name: DefinitionsColumn<Row> = {
  cell: () => null,
  header: 'Name',
  sortValue: (row) => row.name,
}
const size: DefinitionsColumn<Row> = {
  cell: () => null,
  header: 'Size',
  numeric: true,
  sortValue: (row) => row.size,
}
const columns = [name, size]
const groupOf = (row: Row) => row.group

const rows: Row[] = [
  { group: 'b', name: 'item10', size: 5 },
  { group: 'a', name: 'item9' },
  { group: 'b', name: 'item2', size: 30 },
  { group: 'a', name: 'item1', size: 1 },
]

const names = (list: Row[]) => list.map((row) => row.name)

describe('nextSort', () => {
  it('cycles text A to Z, Z to A, then off', () => {
    const first = nextSort(null, name)
    const second = nextSort(first, name)
    expect(first).toEqual({ descending: false, header: 'Name' })
    expect(second).toEqual({ descending: true, header: 'Name' })
    expect(nextSort(second, name)).toBeNull()
  })

  it('cycles numbers largest first, smallest first, then off', () => {
    const first = nextSort(null, size)
    const second = nextSort(first, size)
    expect(first).toEqual({ descending: true, header: 'Size' })
    expect(second).toEqual({ descending: false, header: 'Size' })
    expect(nextSort(second, size)).toBeNull()
  })

  it('restarts on another column', () => {
    expect(nextSort({ descending: true, header: 'Name' }, size)).toEqual({
      descending: true,
      header: 'Size',
    })
  })
})

describe('sortRows', () => {
  it('keeps the list order when unsorted', () => {
    expect(sortRows(rows, null, columns)).toBe(rows)
  })

  it('sorts text in natural order both ways', () => {
    expect(
      names(sortRows(rows, { descending: false, header: 'Name' }, columns))
    ).toEqual(['item1', 'item2', 'item9', 'item10'])
    expect(
      names(sortRows(rows, { descending: true, header: 'Name' }, columns))
    ).toEqual(['item10', 'item9', 'item2', 'item1'])
  })

  it('puts missing values last in both directions', () => {
    expect(
      names(sortRows(rows, { descending: true, header: 'Size' }, columns))
    ).toEqual(['item2', 'item10', 'item1', 'item9'])
    expect(
      names(sortRows(rows, { descending: false, header: 'Size' }, columns))
    ).toEqual(['item1', 'item10', 'item2', 'item9'])
  })

  it('orders groups by name when unsorted, keeping their rows in list order', () => {
    expect(names(sortRows(rows, null, columns, groupOf))).toEqual([
      'item9',
      'item1',
      'item10',
      'item2',
    ])
  })

  it('orders groups by their leading row and sorts within each', () => {
    expect(
      names(
        sortRows(rows, { descending: true, header: 'Size' }, columns, groupOf)
      )
    ).toEqual(['item2', 'item10', 'item1', 'item9'])
    expect(
      names(
        sortRows(rows, { descending: false, header: 'Size' }, columns, groupOf)
      )
    ).toEqual(['item1', 'item9', 'item10', 'item2'])
  })
})
