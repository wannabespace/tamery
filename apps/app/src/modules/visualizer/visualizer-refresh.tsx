import { partialMatchKey, useIsFetching } from '@tanstack/react-query'
import { useState } from 'react'

import { useConnectionContext } from '~/core/connection/route'
import { structureQueryKey } from '~/core/queries/indexes/list'
import { resourcePoliciesQueryOptions } from '~/core/queries/policies/list'
import { resourceColumnsQueryKey } from '~/core/queries/tables/columns'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { resourceTriggersQueryOptions } from '~/core/queries/triggers/list'
import { TabRefreshButton } from '~/core/tabs/refresh-button'
import { useRefreshHotkey } from '~/hooks/use-refresh-hotkey'
import { queryClient } from '~/lib/query-client'

export const VisualizerRefresh = () => {
  const { connectionResource } = useConnectionContext()
  const tablesAndSchemasKey = resourceTablesAndSchemasQueryOptions({
    connectionResource,
  }).queryKey
  const columnsKey = resourceColumnsQueryKey({ connectionResource })
  const structureKey = structureQueryKey(connectionResource)
  const triggersKey = resourceTriggersQueryOptions({
    connectionResource,
  }).queryKey
  const policiesKey = resourcePoliciesQueryOptions({
    connectionResource,
  }).queryKey
  const keys = [
    tablesAndSchemasKey,
    columnsKey,
    structureKey,
    triggersKey,
    policiesKey,
  ]
  const isFetching =
    useIsFetching({
      predicate: (query) =>
        keys.some((key) => partialMatchKey(query.queryKey, key)),
    }) > 0
  const [isUserRefreshing, setIsUserRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsUserRefreshing(true)

    return Promise.all([
      ...keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) =>
          partialMatchKey(queryKey, [
            'connection-resource',
            connectionResource.id,
          ]) && queryKey.includes('total'),
      }),
    ]).finally(() => setIsUserRefreshing(false))
  }

  useRefreshHotkey(handleRefresh, isFetching)

  return (
    <TabRefreshButton
      label="Refresh diagram"
      refreshing={isUserRefreshing}
      onRefresh={handleRefresh}
    />
  )
}
