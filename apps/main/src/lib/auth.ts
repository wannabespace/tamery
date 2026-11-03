import { PASSKEY_ERROR_CODES, passkeyClient } from '@better-auth/passkey/client'
import type { WebAuthnErrorCode } from '@simplewebauthn/browser'
import { queryOptions } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  emailOTPClient,
  lastLoginMethodClient,
  organizationClient,
  twoFactorClient,
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

const getAuthHeadersIsomorphic = createIsomorphicFn()
  .server(() => {
    const request = getRequest()

    return {
      cookie: request.headers.get('cookie') ?? '',
      'user-agent': request.headers.get('user-agent') ?? '',
    }
  })
  .client(() => ({}))

export const authClient = createAuthClient({
  basePath: '/auth',
  baseURL: import.meta.env.VITE_PUBLIC_API_URL,
  fetchOptions: {
    onRequest: (request) => {
      const headers = getAuthHeadersIsomorphic()

      for (const [key, value] of Object.entries(headers)) {
        request.headers.set(key, value)
      }

      return request
    },
  },
  plugins: [
    organizationClient(),
    twoFactorClient(),
    emailOTPClient(),
    lastLoginMethodClient(),
    passkeyClient(),
  ],
})

// Never compare against authClient.$ERROR_CODES: it exists only in Better Auth's types, at runtime it is a path proxy and no code ever equals it.
export const SESSION_NOT_FRESH_CODE = 'SESSION_NOT_FRESH'

// A dismissed or timed-out browser prompt reports NotAllowedError, which arrives as the passthrough code, not AUTH_CANCELLED.
const PASSKEY_DISMISSED_CODES = new Set<string>([
  PASSKEY_ERROR_CODES.AUTH_CANCELLED.code,
  ...([
    'ERROR_CEREMONY_ABORTED',
    'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
  ] satisfies WebAuthnErrorCode[]),
])

export const isPasskeyPromptDismissed = ({ code }: { code?: string }) =>
  code !== undefined && PASSKEY_DISMISSED_CODES.has(code)

// The router drops this only on Better Auth's session signal: a session change made outside the auth client must remove it too.
export const sessionQueryOptions = queryOptions({
  queryFn: () => authClient.getSession(),
  queryKey: ['session'],
  staleTime: ({ state }) => (state.data?.data?.user ? 'static' : 0),
})

// Better Auth's session signal fires 10ms after a response, so a router.invalidate() in that mutation's onSuccess would reread the old session.
export const useReloadSession = () => {
  const router = useRouter()

  return () => {
    router.options.context.queryClient.removeQueries({
      queryKey: sessionQueryOptions.queryKey,
    })

    return router.invalidate()
  }
}

const LAST_USED_LOGIN_METHOD_COOKIE = 'better-auth.last_used_login_method'

export const getLastUsedLoginMethod = createIsomorphicFn()
  .server(() => {
    const cookie = getRequest().headers.get('cookie') ?? ''
    const match = cookie.match(
      new RegExp(
        `(?:^|; )${LAST_USED_LOGIN_METHOD_COOKIE}=(?<value>[^;]+)`,
        'u'
      )
    )

    const value = match?.groups?.value
    return value ? decodeURIComponent(value) : null
  })
  .client(() => authClient.getLastUsedLoginMethod())
