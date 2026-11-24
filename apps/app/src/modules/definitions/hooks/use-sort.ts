import { useState } from 'react'

import type { DefinitionsSection } from '~/core/catalog/sections'
import { posthog } from '~/lib/posthog'

import type { DefinitionsColumn, SortValue } from '../lib/columns'

export interface DefinitionsSort {
  descending: boolean
  header: string
}

const isMissing = (value: SortValue): value is null | undefined =>
  value === null || value === undefined

const compare = (left: SortValue, right: SortValue) => {
  if (isMissing(left) || isMissing(right)) {
    return Number(isMissing(left)) - Number(isMissing(right))
  }
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true })
}

const nextSort = (
  current: DefinitionsSort | null,
  header: string,
  numeric: boolean
): DefinitionsSort | null => {
  if (current?.header !== header) {
    return { descending: numeric, header }
  }
  return current.descending === numeric
    ? { descending: !numeric, header }
    : null
}

/** Numbers sort largest first, text A to Z; a third click restores the list's own order. Groups keep their rows together, sorted within, and line up by their leading row while sorted (alphabetically otherwise). */
export const useSort = <T>({
  columns,
  groupOf,
  rows,
  section,
}: {
  columns: DefinitionsColumn<T>[]
  groupOf?: (item: T) => string
  rows: T[]
  section: DefinitionsSection
}) => {
  const [sort, setSort] = useState<DefinitionsSort | null>(null)
  const sortValue = columns.find(
    ({ header }) => header === sort?.header
  )?.sortValue
  const direction = sort?.descending ? -1 : 1
  const sorted = sortValue
    ? rows.toSorted((a, b) => {
        const order = compare(sortValue(a), sortValue(b))
        return isMissing(sortValue(a)) || isMissing(sortValue(b))
          ? order
          : direction * order
      })
    : rows

  const toggleSort = (column: DefinitionsColumn<T>) => {
    const sample = rows
      .map((item) => column.sortValue?.(item))
      .find((value) => !isMissing(value))
    const next = nextSort(sort, column.header, typeof sample === 'number')
    setSort(next)
    posthog.capture('definitions_sorted', {
      descending: next?.descending,
      section,
      sorted: !!next,
    })
  }

  const groupRank = new Map<string, number>()
  for (const item of sorted) {
    if (groupOf && !groupRank.has(groupOf(item))) {
      groupRank.set(groupOf(item), groupRank.size)
    }
  }

  return {
    rows: groupOf
      ? sorted.toSorted((a, b) =>
          sortValue
            ? (groupRank.get(groupOf(a)) ?? 0) -
              (groupRank.get(groupOf(b)) ?? 0)
            : groupOf(a).localeCompare(groupOf(b))
        )
      : sorted,
    sort,
    toggleSort,
  }
}
