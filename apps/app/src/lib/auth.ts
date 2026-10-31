import { type } from 'arktype'
import { anonymousClient, organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { Result } from 'better-result'
import { useSubscription } from 'seitu/react'
import { createWebStorageValue } from 'seitu/web'
import { toast } from 'sonner'

import { deviceEncryption } from './device-encryption'
import {
  history,
  isAuthLocation,
  lastLocationStorageValue,
} from './last-location'
import { posthog } from './posthog'
import { API_QUERY_KEY, queryClient } from './query-client'
import { apiUrl } from './urls'

const BEARER_TOKEN_KEY = 'tamery.bearer_token'
const SESSION_CACHE_KEY = 'tamery.session'

export const bearerToken = createWebStorageValue({
  defaultValue: null,
  key: BEARER_TOKEN_KEY,
  schema: type('string | null'),
  type: 'localStorage',
})

export const successAuthToast = (newUser: boolean) => {
  toast.success(
    newUser
      ? "Welcome to Tamery! We're excited to help you manage your connections with ease. Get started by creating your first connection."
      : 'Welcome back! Your connections are ready for you.',
    {
      duration: 10_000,
      position: 'top-center',
    }
  )
}

export const authClient = createAuthClient({
  basePath: '/auth',
  baseURL: apiUrl,
  fetchOptions: {
    auth: {
      token: () => bearerToken.get() ?? undefined,
      type: 'Bearer',
    },
    headers: {
      'x-desktop': JSON.stringify(!!window.electron),
    },
    onError({ error }) {
      if (error.status === 401 && !isAuthLocation()) {
        // oxlint-disable-next-line no-use-before-define
        fullSignOut()
      }
    },
  },
  plugins: [anonymousClient(), organizationClient()],
})

const sessionCache = createWebStorageValue({
  defaultValue: null,
  key: SESSION_CACHE_KEY,
  schema: type('object | null').as<typeof authClient.$Infer.Session | null>(),
  type: 'localStorage',
})

// Must run before anything subscribes to the session atom; hydrateSession only fills an empty atom.
authClient.hydrateSession(sessionCache.get())
authClient.$store.atoms.session?.listen(({ data }) => sessionCache.set(data))

export const getSessionUser = async () => {
  const user = sessionCache.get()?.user

  if (user) {
    return user
  }

  const session = await Result.tryPromise(() => authClient.getSession())

  return session.unwrapOr(null)?.data?.user
}

export const isAnonymous = () => !!sessionCache.get()?.user.isAnonymous

export const useIsAnonymous = () =>
  useSubscription(sessionCache, {
    selector: (session) => !!session?.user.isAnonymous,
  })

// Not the better-auth session atom: it keeps the user until the post-sign-out refetch lands.
export const useHasAccount = () =>
  useSubscription(sessionCache, {
    selector: (session) => !!session && !session.user.isAnonymous,
  })

export const isSignedIn = async () => !!(await getSessionUser())

export const fullSignOut = async () => {
  const [{ cleanCollections }, { clearDb }, { subscriptionsCache }] =
    await Promise.all([
      import('~/core/collections'),
      import('./sync'),
      import('~/core/user/use-subscription'),
    ])

  // Before the session is revoked: a sync loop still running reconnects into a 401.
  await cleanCollections()
  await authClient.signOut()
  bearerToken.clear()
  sessionCache.clear()
  lastLocationStorageValue.clear()

  if (!isAuthLocation()) {
    history.push('/auth')
  }

  subscriptionsCache.clear()
  posthog.reset()
  queryClient.removeQueries({ queryKey: [API_QUERY_KEY] })
  await Promise.all([clearDb(), deviceEncryption.reset()])
}
