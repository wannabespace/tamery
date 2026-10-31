import '@tamery/shared/arktype-config'
import {
  keepPreviousData,
  MutationCache,
  QueryClient,
} from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { RoutePending } from './components/route-pending'
import { authClient, sessionQueryOptions } from './lib/auth'
import { posthog } from './lib/posthog'
import { routeTree } from './routeTree.gen'
import { handleError } from './utils/error'

const PENDING_DELAY_MS = 150

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        onError: handleError,
      },
      queries: {
        placeholderData: keepPreviousData,
        retry: false,
      },
    },
    mutationCache: new MutationCache({
      onSettled: (_data, error, _variables, _context, mutation) => {
        if (mutation.meta?.event) {
          void posthog.capture(mutation.meta.event, { success: !error })
        }
      },
    }),
  })

  const router = createRouter({
    context: {
      queryClient,
    },
    defaultPendingComponent: RoutePending,
    defaultPendingMinMs: 0,
    defaultPendingMs: PENDING_DELAY_MS,
    defaultPreload: 'intent',
    // TanStack Query owns data freshness; the router must not serve its own cached loader results.
    defaultPreloadStaleTime: 0,
    notFoundMode: 'root',
    routeTree,
    scrollRestoration: true,
  })

  setupRouterSsrQueryIntegration({ queryClient, router })

  if (typeof window !== 'undefined') {
    // Better Auth fires the signal 10ms after sign-in, mid root `beforeLoad` fetch: removing a fetching query cancels it and the route throws CancelledError.
    authClient.$store.listen('$sessionSignal', () =>
      queryClient.removeQueries({
        fetchStatus: 'idle',
        queryKey: sessionQueryOptions.queryKey,
      })
    )
  }

  return router
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { event?: string }
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
