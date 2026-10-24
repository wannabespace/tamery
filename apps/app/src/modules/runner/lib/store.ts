import type { Dialect } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'
import { memoize } from 'memoza'
import { createContext, use } from 'react'
import { createComputed } from 'seitu'
import { createWebStorageValue } from 'seitu/web'

import { useTabContext } from '~/core/connection/route'
import { getQueryLanguage } from '~/core/runtime/language'

import { starterQuery } from './starter'
import { runnerStoreKey } from './tab'

export const RUNNER_RESULTS_MIN_HEIGHT = 160
export const RUNNER_RESULTS_MAX_HEIGHT = 720
export const RUNNER_RESULTS_DEFAULT_HEIGHT = 240

export const runnerPageType = type({
  layout: {
    resultsHeight: ['number', '=', RUNNER_RESULTS_DEFAULT_HEIGHT],
    resultsVisible: 'boolean',
  },
  query: 'string',
})

export interface RunnerTab {
  resourceId: string
  tabId: string
}

export const runnerPageStore = memoize(
  ({ dialect, resourceId, tabId }: RunnerTab & { dialect: Dialect }) =>
    createWebStorageValue({
      defaultValue: {
        layout: {
          resultsHeight: RUNNER_RESULTS_DEFAULT_HEIGHT,
          resultsVisible: true,
        },
        query: starterQuery(dialect),
      },
      key: runnerStoreKey(resourceId, tabId),
      schema: runnerPageType,
      type: 'localStorage',
    })
)

export type RunnerPageStore = ReturnType<typeof runnerPageStore>

export const runnerStatements = memoize(
  ({ dialect, resourceId, tabId }: RunnerTab & { dialect: Dialect }) =>
    createComputed(runnerPageStore({ dialect, resourceId, tabId }), (state) =>
      getQueryLanguage(dialect).split(state.query)
    )
)

export const RunnerTabContext = createContext<RunnerTab | null>(null)

export const useRunnerTab = () => {
  const tab = use(RunnerTabContext)
  if (!tab) {
    throw new Error('RunnerTabContext is not provided')
  }
  return tab
}

export const useRunnerPageStore = () => {
  const { dialect } = useTabContext()
  return runnerPageStore({ dialect, ...useRunnerTab() })
}

export const setQuery = (store: RunnerPageStore, query: string) => {
  if (store.get().query !== query) {
    store.set((state) => ({ ...state, query }) satisfies typeof state)
  }
}

export const appendQuery = (store: RunnerPageStore, sql: string) => {
  const existing = store.get().query.trimEnd()
  setQuery(store, existing ? `${existing}\n\n${sql}` : sql)
}

export const setLayout = (
  store: RunnerPageStore,
  patch: Partial<(typeof runnerPageType.infer)['layout']>
) => {
  store.set(
    (state) =>
      ({
        ...state,
        layout: { ...state.layout, ...patch } satisfies typeof state.layout,
      }) satisfies typeof state
  )
}
