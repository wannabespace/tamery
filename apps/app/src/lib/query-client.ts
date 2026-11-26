import {
  keepPreviousData,
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query'

import { failedAttempt } from './failed-attempt'
import { posthog } from './posthog'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { event?: string }
  }
}

export const API_QUERY_KEY = 'api'

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { networkMode: 'always' },
    queries: {
      networkMode: 'always',
      placeholderData: keepPreviousData,
      retry: 0,
      staleTime: Number.POSITIVE_INFINITY,
      throwOnError: true,
    },
  },
  mutationCache: new MutationCache({
    onError: failedAttempt,
    onSettled: (_data, error, _variables, _context, mutation) => {
      if (mutation.meta?.event) {
        posthog.capture(mutation.meta.event, { success: !error })
      }
    },
  }),
  queryCache: new QueryCache({ onError: failedAttempt }),
})

queryClient.setQueryDefaults([API_QUERY_KEY], {
  networkMode: 'online',
  staleTime: 0,
  throwOnError: false,
})
