import { useQuery } from '@tanstack/react-query'

import { useConnectionContext } from '~/core/connection/route'
import { resourceConstraintsQueryOptions } from '~/core/queries/constraints/list'
import {
  getColumnDefinition,
  resourceColumnsQueryOptions,
} from '~/core/queries/tables/columns'

export interface ColumnReference {
  column: string
  schema: string
  table: string
}

export interface ReferenceTarget extends ColumnReference {
  label: string
  type: string
}

export const useReferenceTargets = (enabled: boolean) => {
  const { connectionResource, defaultSchema } = useConnectionContext()
  const { data: constraints = [], isLoading: constraintsLoading } = useQuery({
    ...resourceConstraintsQueryOptions({ connectionResource }),
    enabled,
    throwOnError: false,
  })
  const { data: columns = [], isLoading: columnsLoading } = useQuery({
    ...resourceColumnsQueryOptions({ connectionResource }),
    enabled,
    throwOnError: false,
  })
  const typeOf = new Map(
    columns.map((column) => [
      `${column.schema}.${column.table}.${column.id}`,
      getColumnDefinition(column).type,
    ])
  )
  const keys = Map.groupBy(
    constraints.filter(
      (constraint) =>
        constraint.type === 'primaryKey' || constraint.type === 'unique'
    ),
    (constraint) =>
      `${constraint.schema}.${constraint.table}.${constraint.name}`
  )
  const targets = new Map<string, ReferenceTarget>()

  for (const [key, ...rest] of keys.values()) {
    const type =
      key?.column && typeOf.get(`${key.schema}.${key.table}.${key.column}`)
    if (key?.column && type && rest.length === 0) {
      const name = `${key.table}.${key.column}`
      const label =
        key.schema === defaultSchema ? name : `${key.schema}.${name}`
      targets.set(label, {
        column: key.column,
        label,
        schema: key.schema,
        table: key.table,
        type,
      })
    }
  }

  return { loading: constraintsLoading || columnsLoading, targets }
}
