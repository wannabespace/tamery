import { silently } from '@tamery/shared/utils'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { ConnectionResource } from '~/core/connection/sync'
import { resourceTableColumnsQueryOptions } from '~/core/queries/tables/columns'
import { connectionResourceToQueryParams } from '~/core/runtime/query'
import { queryClient } from '~/lib/query-client'

import type { TablePageStore } from './store'
import type { TableParams } from './tab'

const TIME_COLUMNS = [
  'timestamp',
  'created_at',
  '$start_timestamp',
  'min_first_timestamp',
]

export const seedNewestFirst = (
  store: TablePageStore,
  connectionResource: ConnectionResource,
  params: TableParams
) =>
  silently(async () => {
    if (store.get().newestFirstSeeded) {
      return
    }
    const { dialect } =
      await connectionResourceToQueryParams(connectionResource)
    if (!getCapabilities(dialect).flags.includes('firstRowsOnly')) {
      return
    }
    const columns = await queryClient.query(
      resourceTableColumnsQueryOptions({ connectionResource, ...params })
    )
    const newest = TIME_COLUMNS.find((name) =>
      columns.some((column) => column.id === name)
    )
    // Only once, or a sort the user clears comes back on the next open.
    store.set(
      (state) =>
        ({
          ...state,
          newestFirstSeeded: true,
          orderBy:
            newest && Object.keys(state.orderBy).length === 0
              ? { [newest]: 'DESC' }
              : state.orderBy,
        }) satisfies typeof state
    )
  })
