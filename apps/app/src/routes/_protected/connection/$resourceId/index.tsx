import { LayoutTable02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { getConnectionResourceStore } from '~/core/connection/stores'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { resolveTab } from '~/core/tabs/kinds'
import { createTableDialogRef } from '~/modules/navigator/create-table-dialog'
import { RecentTables } from '~/modules/table/components/recent-tables'

const EmptyPane = () => {
  const router = useRouter()
  const names = useObjectNames()
  const { connectionResource } = useConnectionContext()
  const { data } = useQuery(
    resourceTablesAndSchemasQueryOptions({ connectionResource })
  )
  const hasNoTables = data?.schemas.every(
    (schema) => schema.tables.length === 0
  )

  useEffect(() => {
    void router.loadRouteChunk(
      router.routesById['/_protected/connection/$resourceId/$tabId']
    )
  }, [router])

  return (
    <IconEmpty
      icon={LayoutTable02Icon}
      title="Nothing Open"
      description={
        hasNoTables
          ? `Create the first ${names.table}, or open a new query to get started.`
          : `Choose a ${names.table} from the sidebar, or open a new query to get started.`
      }
    >
      {hasNoTables ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => createTableDialogRef.current?.create()}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          New {names.table}
        </Button>
      ) : (
        <RecentTables />
      )}
    </IconEmpty>
  )
}

export const Route = createFileRoute('/_protected/connection/$resourceId/')({
  component: EmptyPane,
  beforeLoad: ({ params }) => {
    const { activeTabId, tabs } = getConnectionResourceStore(
      params.resourceId
    ).get()

    const isOpenable =
      !!activeTabId &&
      !!resolveTab(activeTabId) &&
      tabs.some((tab) => tab.id === activeTabId)

    if (isOpenable) {
      throw redirect({
        params: { resourceId: params.resourceId, tabId: activeTabId },
        to: '/connection/$resourceId/$tabId',
      })
    }
  },
})
