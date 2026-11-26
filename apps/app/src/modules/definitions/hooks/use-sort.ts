import { useState } from 'react'

import type { DefinitionsSection } from '~/core/catalog/sections'
import { posthog } from '~/lib/posthog'

import type { DefinitionsColumn, SortValue } from '../lib/columns'

export interface DefinitionsSort {
  descending: boolean
  header: string
}

const collate = new Intl.Collator(undefined, { numeric: true }).compare

const isMissing = (value: SortValue) => value === null || value === undefined

const compare = (left: SortValue, right: SortValue, direction: number) => {
  if (isMissing(left) || isMissing(right)) {
    return Number(isMissing(left)) - Number(isMissing(right))
  }
  return (
    direction *
    (typeof left === 'number' && typeof right === 'number'
      ? left - right
      : collate(String(left), String(right)))
  )
}

export const nextSort = <T>(
  sort: DefinitionsSort | null,
  { header, numeric = false }: DefinitionsColumn<T>
) => {
  const same = sort?.header === header
  return same && sort.descending !== numeric
    ? null
    : { descending: numeric !== same, header }
}

export const sortRows = <T>(
  rows: T[],
  sort: DefinitionsSort | null,
  columns: DefinitionsColumn<T>[],
  groupOf?: (item: T) => string
) => {
  const sortValue = columns.find(
    ({ header }) => header === sort?.header
  )?.sortValue
  const direction = sort?.descending ? -1 : 1
  const sorted = sortValue
    ? rows.toSorted((a, b) => compare(sortValue(a), sortValue(b), direction))
    : rows
  if (!groupOf) {
    return sorted
  }
  return sortValue
    ? [...Map.groupBy(sorted, groupOf).values()].flat()
    : sorted.toSorted((a, b) => groupOf(a).localeCompare(groupOf(b)))
}

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

  const toggleSort = (column: DefinitionsColumn<T>) => {
    const next = nextSort(sort, column)
    setSort(next)
    posthog.capture('definitions_sorted', {
      descending: next?.descending,
      section,
      sorted: !!next,
    })
  }

  return { rows: sortRows(rows, sort, columns, groupOf), sort, toggleSort }
}
