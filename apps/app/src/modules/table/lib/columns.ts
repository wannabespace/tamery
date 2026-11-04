import type { Dialect } from '@tamery/shared/enums/connection-type'
import { useQueries } from '@tanstack/react-query'
import { createContext, use } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'
import type { ConnectionResource } from '~/core/connection/sync'
import { resourceConstraintsQueryOptions } from '~/core/queries/constraints/list'
import { findEnum, resourceEnumsQueryOptions } from '~/core/queries/enums/list'
import { resourceTableColumnsQueryOptions } from '~/core/queries/tables/columns'
import type { Column } from '~/core/table/cell/utils'
import { getColumnUiType } from '~/core/table/cell/utils'

const rowFieldColumn = (id: string, value: unknown): Column => {
  const isBoolean = typeof value === 'boolean'
  return {
    id,
    isEditable: true,
    isNullable: true,
    type: isBoolean ? 'bool' : '',
    uiType: isBoolean ? 'boolean' : 'raw',
  }
}

export const withRowFieldColumns = (
  dialect: Dialect,
  columns: Column[],
  rows: readonly Record<string, unknown>[]
): Column[] => {
  if (getCapabilities(dialect).flags.includes('declaredColumns')) {
    return columns
  }
  const known = new Set(columns.map((column) => column.id))
  const extra = new Map<string, Column>()
  for (const row of rows) {
    for (const [id, value] of Object.entries(row)) {
      if (!known.has(id) && !extra.has(id)) {
        extra.set(id, rowFieldColumn(id, value))
      }
    }
  }
  return extra.size === 0 ? columns : [...columns, ...extra.values()]
}

export const useTableColumnsQuery = ({
  connectionResource,
  table,
  schema,
}: {
  connectionResource: ConnectionResource
  table: string
  schema: string
}) => {
  const { dialect } = useConnectionContext()
  return useQueries({
    combine: ([columns, constraints, enums]): {
      data?: Column[]
      isPending: boolean
      error: Error | null
    } => {
      if (columns.isPending || constraints.isPending || enums.isPending) {
        return {
          data: [],
          error: null,
          isPending: true,
        }
      }

      const constraintsData = constraints.data || []
      const data = columns.data
        ?.map((column): Column => {
          const columnConstraints = constraintsData.filter(
            (c) =>
              c.column === column.id && c.schema === schema && c.table === table
          )
          const foreignConstraint = columnConstraints.find(
            (c) => c.type === 'foreignKey'
          )
          const uniqueConstraint = columnConstraints.find(
            (c) => c.type === 'unique'
          )
          const primaryConstraint = columnConstraints.find(
            (c) => c.type === 'primaryKey'
          )

          return {
            ...column,
            availableValues:
              column.enumName && enums.data
                ? findEnum({
                    column,
                    enums: enums.data,
                    table,
                  })?.values
                : undefined,
            defaultValue: column.default,
            foreign:
              foreignConstraint &&
              foreignConstraint.foreignSchema &&
              foreignConstraint.foreignTable &&
              foreignConstraint.foreignColumn
                ? {
                    column: foreignConstraint.foreignColumn,
                    name: foreignConstraint.name,
                    onDelete: foreignConstraint.onDelete ?? undefined,
                    onUpdate: foreignConstraint.onUpdate ?? undefined,
                    schema: foreignConstraint.foreignSchema,
                    table: foreignConstraint.foreignTable,
                  }
                : undefined,
            primaryKey: primaryConstraint?.name,
            references: constraintsData
              .filter(
                (c) =>
                  c.type === 'foreignKey' &&
                  c.foreignColumn === column.id &&
                  c.foreignSchema === schema &&
                  c.foreignTable === table &&
                  !!c.column
              )
              .map((c) => {
                const isUnique = constraintsData.some(
                  (u) =>
                    (u.type === 'unique' || u.type === 'primaryKey') &&
                    u.schema === c.schema &&
                    u.table === c.table &&
                    u.column === c.column
                )

                if (!c.column) {
                  return null
                }

                return {
                  column: c.column,
                  isUnique,
                  name: c.name,
                  schema: c.schema,
                  table: c.table,
                }
              })
              .filter((ref) => ref !== null),
            uiType: getColumnUiType(dialect, column),
            unique: uniqueConstraint?.name,
          } satisfies Column
        })
        .toSorted((a, b) => {
          if (a.primaryKey && !b.primaryKey) {
            return -1
          }
          if (!a.primaryKey && b.primaryKey) {
            return 1
          }
          return 0
        })

      return {
        data,
        error: columns.error || constraints.error,
        isPending: columns.isPending || constraints.isPending,
      }
    },
    queries: [
      resourceTableColumnsQueryOptions({ connectionResource, schema, table }),
      resourceConstraintsQueryOptions({ connectionResource }),
      resourceEnumsQueryOptions({ connectionResource }),
    ],
  })
}

export const ColumnsContext = createContext<{
  columns: Column[]
  isPending: boolean
} | null>(null)

export const useTableColumnsContext = () => {
  const context = use(ColumnsContext)
  if (!context) {
    throw new Error(
      'useTableColumnsContext must be used within a ColumnsContext provider'
    )
  }
  return context
}
