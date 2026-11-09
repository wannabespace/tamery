import { useConnectionContext } from '~/core/connection/route'
import type { Column } from '~/core/table/cell/utils'
import { getColumnKind, getColumnUiType } from '~/core/table/cell/utils'
import { useReferencedColumns } from '~/core/table/referenced-columns'

import { useTableColumnsContext } from '../../lib/columns'
import { filterLabel } from './filter-chip'
import type { FilterComposer } from './filter-composer'

export const useFilterTargets = ({
  query,
  stage,
  valueFilterText,
}: FilterComposer) => {
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
  const jsonColumn =
    path.length > 0 &&
    path.every(Boolean) &&
    columns.find(
      (column) =>
        column.id === head && getColumnKind(dialect, column) === 'json'
    )

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
    jsonPathTarget: jsonColumn ? { column: jsonColumn.id, path } : undefined,
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
