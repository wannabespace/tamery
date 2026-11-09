import { useConnectionContext } from '~/core/connection/route'
import type { Column } from '~/core/table/cell/utils'
import { getColumnKind, getColumnUiType } from '~/core/table/cell/utils'
import { useReferencedColumns } from '~/core/table/referenced-columns'
import { isNested } from '~/core/transformers/value-transformer'

import { useTableColumnsContext } from '../../lib/columns'
import { filterLabel } from './filter-chip'
import type { FilterComposer } from './filter-composer'

const JSON_KEYS = 50

const valueAt = (value: unknown, path: string[]) => {
  let current = value
  for (const key of path) {
    current = isNested(current)
      ? (current as Record<string, unknown>)[key]
      : undefined
  }
  return current
}

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

  const [head = '', ...path] = query.trim().split('.')
  const parent = path.slice(0, -1)
  const partial = (path.at(-1) ?? '').toLowerCase()
  const jsonColumn =
    path.length > 0 &&
    parent.every(Boolean) &&
    columns.some(
      (column) =>
        column.id === head && getColumnKind(dialect, column) === 'json'
    )
  const siblings = jsonColumn
    ? rows.flatMap((row) => {
        const value = valueAt(row[head], parent)
        return isNested(value) ? Object.entries(value) : []
      })
    : []
  const jsonKeys = [...Map.groupBy(siblings, ([key]) => key)]
    .filter(([key]) => key.toLowerCase().includes(partial))
    .toSorted(([, a], [, b]) => b.length - a.length)
    .slice(0, JSON_KEYS)
    .map(([key, entries]) => ({
      nested: entries.some(([, value]) => isNested(value)),
      target: { column: head, path: [...parent, key] },
    }))
  const typedPath =
    jsonColumn &&
    partial !== '' &&
    !jsonKeys.some(
      ({ target }) => target.path.at(-1)?.toLowerCase() === partial
    )
      ? { column: head, path }
      : undefined

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
    jsonKeys,
    matchingColumns: columns
      .filter((column) => column.id.toLowerCase().includes(columnQuery))
      .toSorted((a, b) => columnRank(a) - columnRank(b)),
    matchingRelated:
      columnQuery === ''
        ? []
        : related.filter((entry) =>
            filterLabel(entry).toLowerCase().includes(columnQuery)
          ),
    typedPath,
    matchingValues: suggestedValues.filter((value) =>
      value.toLowerCase().includes(valueFilterText.toLowerCase())
    ),
  }
}
