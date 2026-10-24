import type { Dialect } from '@tamery/shared/enums/connection-type'
import { useState } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { isComputed } from '~/core/queries/tables/columns'
import type { Column } from '~/core/table/cell/utils'
import { isComparableColumn } from '~/core/table/cell/utils'

import type { ColumnActions } from '../../lib/column-menu'
import { isSortable } from '../../lib/column-menu'
import { columnDialogRef } from './column-dialog'
import type { DistinctValuesTarget } from './distinct-values'
import { DistinctValues } from './distinct-values'

export const useColumnActions = ({
  dialect,
  editable,
  schema,
  table,
}: {
  dialect: Dialect
  editable: boolean
  schema: string
  table: string
}) => {
  const [distinct, setDistinct] = useState<DistinctValuesTarget | null>(null)

  const getActions = (column: Column): ColumnActions => ({
    names: getCapabilities(dialect).names,
    onDistinctValues: isComparableColumn(dialect, column)
      ? (anchor) => setDistinct({ anchor, column })
      : undefined,
    onEdit:
      editable && !isComputed(column)
        ? () => columnDialogRef.current?.edit(column)
        : undefined,
    sortable: isSortable(dialect, column),
  })

  const dialogs = (
    <DistinctValues
      schema={schema}
      table={table}
      target={distinct}
      onClose={() => setDistinct(null)}
    />
  )

  return { dialogs, getActions }
}
