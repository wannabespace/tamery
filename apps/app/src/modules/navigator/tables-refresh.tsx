import { RefreshButton } from '@tamery/ui/components/custom/refresh-button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useQuery } from '@tanstack/react-query'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'

export const TablesRefresh = () => {
  const { connectionResource, dialect } = useConnectionContext()
  const names = useObjectNames()
  const { dataUpdatedAt, isFetching, refetch } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <RefreshButton
            aria-label={`Refresh ${names.table}s`}
            variant="ghost-muted"
            size="icon-sm"
            iconClassName="size-4"
            onClick={() => refetch()}
            refreshing={isFetching}
          />
        }
      />
      <TooltipContent side="bottom">
        <div className="flex flex-col gap-0.5">
          <span>
            Refresh {names.table}s
            {getCapabilities(dialect).flags.includes('schemas') &&
              ' and schemas'}
          </span>
          <span className="opacity-70">
            Last updated:{' '}
            {dataUpdatedAt
              ? new Date(dataUpdatedAt).toLocaleTimeString()
              : 'never'}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
