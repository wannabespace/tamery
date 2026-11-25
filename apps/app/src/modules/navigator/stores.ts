import { type } from 'arktype'
import { memoize } from 'memoza'
import { createRef } from 'react'
import { createStore } from 'seitu'
import { createWebStorageValue } from 'seitu/web'

import { schemaItems } from '~/core/tabs/kinds'
import { posthog } from '~/lib/posthog'

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

export type NavigatorMode = 'tables' | 'definitions'

export const getNavigatorStore = memoize(
  (_resourceId: string, activeTabId?: string) =>
    createStore<NavigatorMode>(
      schemaItems.some((item) => item.tabId === activeTabId)
        ? 'definitions'
        : 'tables'
    ),
  { cacheKey: (resourceId) => resourceId }
)
