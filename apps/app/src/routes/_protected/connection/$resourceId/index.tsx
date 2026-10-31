import { LayoutTable02Icon } from '@hugeicons/core-free-icons'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useObjectNames } from '~/core/catalog/names'
import { getConnectionResourceStore } from '~/core/connection/stores'
import { resolveTab } from '~/core/tabs/kinds'
import { RecentTables } from '~/modules/table/components/recent-tables'

const EmptyPane = () => {
  const router = useRouter()
  const names = useObjectNames()

  useEffect(() => {
    void router.loadRouteChunk(
      router.routesById['/_protected/connection/$resourceId/$tabId']
    )
  }, [router])

  return (
    <IconEmpty
      icon={LayoutTable02Icon}
      title="Nothing Open"
      description={`Choose a ${names.table} from the sidebar, or open a new query to get started.`}
    >
      <RecentTables />
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
