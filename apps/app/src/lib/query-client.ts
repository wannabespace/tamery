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

// A promise may reject with any value, and a WeakMap takes objects only.
const recordAttempt = (error: unknown) => {
  if (error instanceof Error) {
    failedAttempt(error)
  }
}

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
    onError: recordAttempt,
    onSettled: (_data, error, _variables, _context, mutation) => {
      if (mutation.meta?.event) {
        posthog.capture(mutation.meta.event, { success: !error })
      }
    },
  }),
  queryCache: new QueryCache({ onError: recordAttempt }),
})

queryClient.setQueryDefaults([API_QUERY_KEY], {
  networkMode: 'online',
  staleTime: 0,
  throwOnError: false,
})
