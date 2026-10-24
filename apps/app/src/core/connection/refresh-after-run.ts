import type { Dialect } from '@tamery/shared/enums/connection-type'

import type { ConnectionResource } from '~/core/connection/sync'
import { resourceColumnsQueryKey } from '~/core/queries/tables/columns'
import { getQueryLanguage } from '~/core/runtime/language'
import { queryClient } from '~/lib/query-client'

export const refreshCatalog = (connectionResource: ConnectionResource) => {
  void queryClient.invalidateQueries({
    queryKey: ['connection-resource', connectionResource.id],
  })
  queryClient.removeQueries({
    queryKey: resourceColumnsQueryKey({ connectionResource }),
    type: 'inactive',
  })
}

export const refreshAfterRun = (
  connectionResource: ConnectionResource,
  dialect: Dialect,
  text: string
) => {
  const language = getQueryLanguage(dialect)
  if (language.invalidatesCatalog(text)) {
    refreshCatalog(connectionResource)
  } else if (language.writesData(text)) {
    // Sync with resourceRowsQueryKey and resourceTableTotalQueryKey: every row-data key starts with this prefix.
    void queryClient.invalidateQueries({
      queryKey: ['connection-resource', connectionResource.id, 'schema'],
    })
  }
}
