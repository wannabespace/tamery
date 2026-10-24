import { useIsFetching } from '@tanstack/react-query'
import { useState } from 'react'

import type { DefinitionsSection } from '~/core/catalog/sections'
import { useConnectionContext } from '~/core/connection/route'
import type { ConnectionResource } from '~/core/connection/sync'
import { resourceConstraintsQueryOptions } from '~/core/queries/constraints/list'
import { resourceEnumsQueryOptions } from '~/core/queries/enums/list'
import { resourceFunctionsQueryOptions } from '~/core/queries/functions/list'
import { resourceIndexesQueryOptions } from '~/core/queries/indexes/list'
import { resourcePoliciesQueryOptions } from '~/core/queries/policies/list'
import { resourcePrivilegesQueryOptions } from '~/core/queries/privileges/list'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { resourceTriggersQueryOptions } from '~/core/queries/triggers/list'
import { TabRefreshButton } from '~/core/tabs/refresh-button'
import { useRefreshHotkey } from '~/hooks/use-refresh-hotkey'
import { queryClient } from '~/lib/query-client'

const DEFINITIONS_QUERY_OPTIONS: Record<
  DefinitionsSection,
  (params: { connectionResource: ConnectionResource }) => { queryKey: string[] }
> = {
  constraints: resourceConstraintsQueryOptions,
  enums: resourceEnumsQueryOptions,
  functions: resourceFunctionsQueryOptions,
  indexes: resourceIndexesQueryOptions,
  policies: resourcePoliciesQueryOptions,
  privileges: resourcePrivilegesQueryOptions,
  triggers: resourceTriggersQueryOptions,
}

export const DefinitionsRefresh = ({
  params: { section },
}: {
  params: { section: DefinitionsSection }
}) => {
  const { connectionResource } = useConnectionContext()
  const { queryKey } = DEFINITIONS_QUERY_OPTIONS[section]({
    connectionResource,
  })
  const isFetching = useIsFetching({ queryKey }) > 0
  const [isUserRefreshing, setIsUserRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsUserRefreshing(true)

    return Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: resourceTablesAndSchemasQueryOptions({ connectionResource })
          .queryKey,
      }),
    ]).finally(() => setIsUserRefreshing(false))
  }

  useRefreshHotkey(handleRefresh, isFetching)

  return (
    <TabRefreshButton
      label={`Refresh ${section}`}
      refreshing={isUserRefreshing}
      onRefresh={handleRefresh}
    />
  )
}
