import { enabledFilters } from '@tamery/shared/filters'
import { silently } from '@tamery/shared/utils'

import { prefetchConnectionResourceTableCore } from '~/core/connection/fetching'
import type { ConnectionResource } from '~/core/connection/sync'
import type { TabView } from '~/core/tabs/types'

import { TableRefresh } from './components/table-refresh'
import { prefetchReferenceLabels } from './lib/labels'
import { tablePageStore } from './lib/store'
import type { TableParams } from './lib/tab'
import { TableTab } from './table-tab'

const prefetch = async (
  connectionResource: ConnectionResource,
  params: TableParams
) => {
  const { columnLabels, filters, hiddenColumns, orderBy } = tablePageStore({
    id: connectionResource.id,
    ...params,
  }).get()

  const rows = await prefetchConnectionResourceTableCore({
    connectionResource,
    query: { exact: false, filters: enabledFilters(filters), orderBy },
    ...params,
  })
  await silently(() =>
    prefetchReferenceLabels({
      connectionResource,
      hidden: hiddenColumns,
      rows,
      stored: columnLabels,
      ...params,
    })
  )
}

export const tableView: TabView<TableParams> = {
  Content: TableTab,
  Refresh: TableRefresh,
  load: ({ connectionResource, params }) =>
    prefetch(connectionResource, params),
  prefetch,
}
