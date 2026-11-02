import { passkeyClient } from '@better-auth/passkey/client'
import { queryOptions } from '@tanstack/react-query'
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

// A dismissed or timed-out browser prompt reports NotAllowedError, which arrives as the passthrough code, not AUTH_CANCELLED.
const PASSKEY_DISMISSED_CODES = new Set([
  'AUTH_CANCELLED',
  'ERROR_CEREMONY_ABORTED',
  'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
])

export const isPasskeyPromptDismissed = ({ code }: { code?: string }) =>
  code !== undefined && PASSKEY_DISMISSED_CODES.has(code)

// The router drops this only on Better Auth's session signal: a session change made outside the auth client must remove it too.
export const sessionQueryOptions = queryOptions({
  queryFn: () => authClient.getSession(),
  queryKey: ['session'],
  staleTime: ({ state }) => (state.data?.data?.user ? 'static' : 0),
})

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
