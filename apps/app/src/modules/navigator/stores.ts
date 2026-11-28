import { type } from 'arktype'
import { memoize } from 'memoza'
import { createRef } from 'react'
import { createStore } from 'seitu'
import { createWebStorageValue } from 'seitu/web'

import { resolveTab, schemaItems } from '~/core/tabs/kinds'
import { posthog } from '~/lib/posthog'
import { chatTab } from '~/modules/chat/tab'

export const navigatorOpenValue = createWebStorageValue({
  defaultValue: true,
  key: 'navigator-open',
  schema: type('boolean'),
  type: 'localStorage',
})

export const createViewDialogRef = createRef<{
  create: (schema?: string) => void
}>()

export const toggleNavigator = () => {
  navigatorOpenValue.set((open) => !open)
  posthog.capture('navigator_toggled')
}

const tableRefType = type({
  schema: 'string',
  table: 'string',
})

export const navigatorStore = memoize((resourceId: string) =>
  createWebStorageValue({
    defaultValue: {
      pinnedTables: [],
      tablesSearch: '',
      tablesTreeOpenedSchemas: null,
    },
    key: `navigator-${resourceId}`,
    schema: type({
      pinnedTables: tableRefType.array(),
      tablesSearch: 'string',
      tablesTreeOpenedSchemas: 'string[] | null',
    }),
    type: 'localStorage',
  })
)

export type NavigatorMode = 'tables' | 'definitions' | 'chats'

const getNavigatorSection = (
  resourceId: string,
  tabId?: string
): NavigatorMode => {
  if (tabId && resolveTab(tabId, resourceId)?.kind === chatTab) {
    return 'chats'
  }
  return schemaItems.some((item) => item.tabId === tabId)
    ? 'definitions'
    : 'tables'
}

export const getNavigatorStore = memoize(
  (resourceId: string, activeTabId?: string) =>
    createStore<NavigatorMode>(getNavigatorSection(resourceId, activeTabId)),
  { cacheKey: (resourceId) => resourceId }
)
