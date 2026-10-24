import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { useQuery } from '@tanstack/react-query'
import { useSubscription } from 'seitu/react'

import { Link } from '~/components/link'
import { getCapabilities } from '~/core/catalog/capabilities'
import { tableTypeIcon } from '~/core/catalog/table-type'
import { useConnectionContext } from '~/core/connection/route'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { tableTabId } from '~/core/tabs/ids'

import { recentTables } from '../lib/tab'

export const RecentTables = () => {
  const { connectionResource, dialect } = useConnectionContext()
  const recent = useSubscription(recentTables(connectionResource.id))
  const { data } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )

  const tables = recent.flatMap((item) => {
    const table = data?.schemas
      .find((schema) => schema.name === item.schema)
      ?.tables.find((entry) => entry.name === item.table)

    return table ? [{ ...item, type: table.type }] : []
  })

  if (tables.length === 0) {
    return null
  }

  return (
    <div className="mt-4 flex w-72 flex-col gap-0.5">
      <span className="text-muted-foreground px-3 pb-1 text-left text-xs font-medium">
        Recent
      </span>
      {tables.map((table) => (
        <Button
          key={`${table.schema}:${table.table}`}
          variant="ghost"
          size="sm"
          className="justify-start"
          render={
            <Link
              to="/connection/$resourceId/$tabId"
              params={{
                resourceId: connectionResource.id,
                tabId: tableTabId(table.schema, table.table),
              }}
              preload="intent"
              preloadDelay={200}
            />
          }
        >
          <HugeiconsIcon
            icon={tableTypeIcon[table.type]}
            strokeWidth={2}
            className="text-muted-foreground"
          />
          <span data-mask className="truncate">
            {table.table}
          </span>
          {getCapabilities(dialect).flags.includes('schemas') && (
            <span
              data-mask
              className="text-muted-foreground ml-auto pl-4 text-xs"
            >
              {table.schema}
            </span>
          )}
        </Button>
      ))}
    </div>
  )
}
