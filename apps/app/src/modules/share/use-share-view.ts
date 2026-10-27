import { enabledFilters } from '@tamery/shared/filters'
import type { ShareView } from '@tamery/shared/share'
import { pick } from '@tamery/shared/utils'
import { useSubscription } from 'seitu/react'

import { useConnectionContext } from '~/core/connection/route'
import { getColumnKind } from '~/core/table/cell/utils'
import { useTableColumnsContext } from '~/modules/table/lib/columns'
import { columnView, useTablePageStore } from '~/modules/table/lib/store'

export const useShareView = (schema: string, table: string): ShareView => {
  const { dialect } = useConnectionContext()
  const { columns } = useTableColumnsContext()
  const { filters, orderBy, ...layout } = useSubscription(useTablePageStore(), {
    selector: (state) => ({
      ...pick(state, ['columnOrder', 'hiddenColumns', 'pinnedColumns']),
      filters: enabledFilters(state.filters),
      orderBy: state.orderBy,
    }),
  })
  return {
    columnTypes: columns.flatMap(({ id, type: columnType }) =>
      columnType === undefined ? [] : [{ id, type: columnType }]
    ),
    columns: columnView(columns, layout, true).visible.map((column) => ({
      id: column.id,
      kind: getColumnKind(dialect, column),
      type: column.type ?? null,
    })),
    filters,
    orderBy,
    schema,
    table,
  }
}
