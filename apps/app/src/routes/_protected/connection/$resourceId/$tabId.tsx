import { title } from '@tamery/shared/title'
import { createFileRoute, getRouteApi, redirect } from '@tanstack/react-router'
import { AnimateView } from 'motion/react-animate-view'
import { useDeferredValue, useEffect } from 'react'

import { prefetchConnectionResourceCore } from '~/core/connection/fetching'
import { ensureTab, setActiveTab } from '~/core/tabs/actions'
import { resolveTab, tabFullTitle } from '~/core/tabs/kinds'
import { tabSearchType } from '~/core/tabs/types'
import { tabViews } from '~/core/tabs/views'

import { TabError } from '../-components/tab-error'

const { useRouteContext } = getRouteApi(
  '/_protected/connection/$resourceId/$tabId'
)

const TabPage = () => {
  const { connectionResource, tab } = useRouteContext()

  useEffect(() => {
    ensureTab(connectionResource.id, tab.id)
    setActiveTab(connectionResource.id, tab.id)
    tab.kind.onActivate?.(connectionResource.id, tab.params)
  }, [connectionResource.id, tab])

  // Router state commits through useSyncExternalStore, which never starts a view transition; the deferred re-render does.
  const shownResourceId = useDeferredValue(connectionResource.id)
  const shownTab = useDeferredValue(tab)
  const view = tabViews[shownTab.kind.type]

  return (
    <AnimateView
      key={`${shownResourceId}:${shownTab.id}`}
      transition={{ duration: 0.04 }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {view && <view.Content id={shownTab.id} params={shownTab.params} />}
      </div>
    </AnimateView>
  )
}

export const Route = createFileRoute(
  '/_protected/connection/$resourceId/$tabId'
)({
  component: TabPage,
  errorComponent: TabError,
  validateSearch: tabSearchType,
  beforeLoad: ({ context, params }) => {
    const resolved = resolveTab(params.tabId, params.resourceId)

    if (
      !resolved ||
      resolved.kind.available?.(resolved.params, context.dialect) === false
    ) {
      throw redirect({
        params: { resourceId: params.resourceId },
        to: '/connection/$resourceId',
      })
    }

    return { tab: { id: params.tabId, ...resolved } }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => {
    const { connection, connectionResource, tab } = context

    prefetchConnectionResourceCore(connectionResource)
    tabViews[tab.kind.type]?.load?.({
      connection,
      connectionResource,
      params: tab.params,
      search: deps,
    })

    return { connection, connectionResource, tab }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: title(
              tabFullTitle(loaderData.tab),
              loaderData.connection.name,
              loaderData.connectionResource.name
            ),
          },
        ]
      : [],
  }),
})
