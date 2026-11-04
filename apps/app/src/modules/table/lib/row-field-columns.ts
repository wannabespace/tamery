import type { Dialect } from '@tamery/shared/enums/connection-type'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { Column } from '~/core/table/cell/utils'

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
  const { flags } = getCapabilities(dialect)
  if (flags.includes('catalogBeyondRows')) {
    const [first] = rows
    return first ? columns.filter(({ id }) => id in first) : columns
  }
  if (flags.includes('declaredColumns')) {
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
