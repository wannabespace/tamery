import type { Dialect } from '@tamery/shared/enums/connection-type'

import { getCapabilities } from '~/core/catalog/capabilities'

import type { TablePageStore, tablePageType } from './store'

const TIME_COLUMNS = [
  'timestamp',
  'created_at',
  '$start_timestamp',
  'min_first_timestamp',
]

export const newestFirst = {
  /** While true, nothing may read the table's rows: the first read would be an arbitrary old page, a second query against the engine's small concurrency limit. */
  isPending: (dialect: Dialect, state: typeof tablePageType.infer) =>
    getCapabilities(dialect).flags.includes('firstRowsOnly') &&
    !state.newestFirstSeeded,

  // Only once, or a sort the user clears comes back on the next open.
  seed: (store: TablePageStore, columns: { id: string }[]) => {
    const newest = TIME_COLUMNS.find((name) =>
      columns.some((column) => column.id === name)
    )
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
  },
}
