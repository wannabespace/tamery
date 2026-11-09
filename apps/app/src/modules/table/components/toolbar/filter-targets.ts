import { useConnectionContext } from '~/core/connection/route'
import type { Column } from '~/core/table/cell/utils'
import { getColumnKind, getColumnUiType } from '~/core/table/cell/utils'
import { useReferencedColumns } from '~/core/table/referenced-columns'
import { isNested } from '~/core/transformers/value-transformer'

import { useTableColumnsContext } from '../../lib/columns'
import { filterLabel } from './filter-chip'
import type { FilterComposer } from './filter-composer'

const SAMPLED_PATHS = 5
const MATCHED_PATHS = 20

const leafPaths = (value: unknown, prefix: string[] = []): string[][] => {
  if (isNested(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      leafPaths(child, [...prefix, key])
    )
  }
  return prefix.length > 0 ? [prefix] : []
}

const commonPaths = (values: unknown[]) =>
  [
    ...Map.groupBy(
      values.flatMap((value) => leafPaths(value)),
      (path) => path.join('.')
    ).values(),
  ]
    .toSorted((a, b) => b.length - a.length)
    .map(([path]) => path)

export const useFilterTargets = (
  { query, stage, valueFilterText }: FilterComposer,
  rows: Record<string, unknown>[]
) => {
  const { dialect } = useConnectionContext()
  const { columns } = useTableColumnsContext()
  const referenced = useReferencedColumns(columns)
  const related = columns.flatMap(({ foreign, id }) =>
    foreign
      ? (referenced.get(id) ?? []).map((target) => ({
          column: id,
          uiType: getColumnUiType(dialect, target),
          via: {
            key: foreign.column,
            schema: foreign.schema,
            table: foreign.table,
            target: target.id,
          },
        }))
      : []
  )

  const columnQuery = query.trim().toLowerCase()
  const columnRank = ({ id }: Column) => {
    const name = id.toLowerCase()
    if (name === columnQuery) {
      return 0
    }
    return name.startsWith(columnQuery) ? 1 : 2
  }

  const jsonColumns = columns.filter(
    (column) => getColumnKind(dialect, column) === 'json'
  )
  const sampledPaths = jsonColumns.flatMap(({ id }) =>
    commonPaths(rows.map((row) => row[id]))
      .map((path) => ({ column: id, path }))
      .filter((target) =>
        filterLabel(target).toLowerCase().includes(columnQuery)
      )
      .slice(0, columnQuery ? MATCHED_PATHS : SAMPLED_PATHS)
  )
  const [head = '', ...path] = query.trim().split('.')
  const typedPath =
    path.length > 0 &&
    path.every(Boolean) &&
    jsonColumns.some(({ id }) => id === head) &&
    !sampledPaths.some(
      (target) => filterLabel(target) === filterLabel({ column: head, path })
    )
      ? [{ column: head, path }]
      : []

  const target = stage.step === 'value' ? stage.target : undefined
  const via = target?.via
  const valueColumn: Pick<Column, 'availableValues' | 'uiType'> | undefined =
    via
      ? related.find(
          (entry) =>
            entry.column === target?.column && entry.via.target === via.target
        )
      : columns.find(({ id }) => id === target?.column)
  const suggestedValues =
    valueColumn?.availableValues ??
    (valueColumn?.uiType === 'boolean' ? ['true', 'false'] : [])

  return {
    jsonPaths: [...typedPath, ...sampledPaths],
    matchingColumns: columns
      .filter((column) => column.id.toLowerCase().includes(columnQuery))
      .toSorted((a, b) => columnRank(a) - columnRank(b)),
    matchingRelated:
      columnQuery === ''
        ? []
        : related.filter((entry) =>
            filterLabel(entry).toLowerCase().includes(columnQuery)
          ),
    matchingValues: suggestedValues.filter((value) =>
      value.toLowerCase().includes(valueFilterText.toLowerCase())
    ),
  }
}
