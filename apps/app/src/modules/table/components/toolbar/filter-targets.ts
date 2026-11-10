import type { JsonPath } from '@tamery/shared/filters'
import { tryParseJson } from '@tamery/shared/utils'

import { useConnectionContext } from '~/core/connection/route'
import type { Column } from '~/core/table/cell/utils'
import { getColumnUiType } from '~/core/table/cell/utils'
import { useReferencedColumns } from '~/core/table/referenced-columns'
import { isNested } from '~/core/transformers/value-transformer'

import { useTableColumnsContext } from '../../lib/columns'
import { filterLabel } from './filter-chip'
import type { FilterComposer } from './filter-composer'
import { isJsonColumn } from './filter-composer'

const JSON_KEYS = 50
const ARRAY_INDEX = /^\d+$/u

// SQLite and SQL Server hand a JSON column over as its text.
const valueAt = (value: unknown, path: JsonPath) => {
  let current = typeof value === 'string' ? tryParseJson(value) : value
  for (const step of path) {
    current = isNested(current)
      ? (current as Record<string | number, unknown>)[step]
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

  const [head = '', ...keys] = query.trim().split('.')
  const partial = (keys.at(-1) ?? '').toLowerCase()
  const jsonColumn =
    keys.length > 0 &&
    keys.slice(0, -1).every(Boolean) &&
    isJsonColumn(dialect, columns, head)
  const samples = jsonColumn ? rows.map((row) => row[head]) : []
  const containersAt = (path: JsonPath) =>
    samples.map((sample) => valueAt(sample, path)).filter(isNested)
  const toPath = (steps: string[]) => {
    const path: JsonPath = []
    for (const key of steps) {
      const [container] = containersAt(path)
      path.push(
        ARRAY_INDEX.test(key) && (!container || Array.isArray(container))
          ? Number(key)
          : key
      )
    }
    return path
  }
  const parent = toPath(keys.slice(0, -1))
  const siblings = containersAt(parent).flatMap((container) =>
    Object.entries(container).map(([key, value]) => ({
      step: Array.isArray(container) ? Number(key) : key,
      value,
    }))
  )
  const jsonKeys = [...Map.groupBy(siblings, ({ step }) => step)]
    .filter(([step]) => String(step).toLowerCase().includes(partial))
    .toSorted(([, a], [, b]) => b.length - a.length)
    .slice(0, JSON_KEYS)
    .map(([step, entries]) => ({
      // A dotted key cannot be typed back into the field, so it is filtered as a whole rather than browsed.
      nested:
        !String(step).includes('.') &&
        entries.some(({ value }) => isNested(value)),
      target: { column: head, path: [...parent, step] },
    }))
  const typedPath =
    jsonColumn &&
    partial !== '' &&
    !jsonKeys.some(
      ({ target }) => String(target.path.at(-1)).toLowerCase() === partial
    )
      ? { column: head, path: toPath(keys) }
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
