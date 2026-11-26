import { ORPCError, os } from '@orpc/server'
import { SESSION_NOT_FOUND_MESSAGE } from '@tamery/shared/constants'
import { isDevelopmentOrigin, ORIGINS } from '@tamery/shared/origins'
import { type } from 'arktype'

import { createApiClient } from '~/api-client'
import { env, nodeEnv } from '~/env'

import type { Context } from './context'

export const orpc = os.$context<Context>()

export const isWebOrigin = (origin: string) =>
  origin === ORIGINS.web ||
  (nodeEnv === 'development' && isDevelopmentOrigin(origin))

const sessionResponse = type({ session: { userId: 'string' } })

export const authenticate = async ({ addLogData, headers }: Context) => {
  const res = await fetch(`${env.API_URL}/auth/get-session`, {
    headers: {
      authorization: headers.get('authorization') ?? '',
      cookie: headers.get('cookie') ?? '',
      'x-proxy-token': env.PROXY_SHARED_SECRET,
    },
  })
  const data = res.ok ? await res.json() : null

  if (!data) {
    throw new ORPCError('UNAUTHORIZED', { message: SESSION_NOT_FOUND_MESSAGE })
  }

  const { userId } = sessionResponse.assert(data).session
  addLogData({ userId })
  return userId
}

export const resolveConnection = async (
  context: Context,
  input: { connectionId: string } | { resourceId: string }
) => {
  // No `authenticate` here: the API refuses this call without a valid session, and the user it answers with is the caller.
  const resolved = await createApiClient({
    authorization: context.headers.get('authorization'),
    cookie: context.headers.get('cookie'),
  }).internal.proxy.resolveConnectionString({ ...input, withUserId: true })
  // An API deployed before `withUserId` ignores it and answers with the bare string.
  if (typeof resolved === 'string') {
    return { connectionString: resolved, userId: await authenticate(context) }
  }
  context.addLogData({ userId: resolved.userId })
  return resolved
}

export const originMiddleware = orpc
  .errors({
    UNAUTHORIZED: { message: SESSION_NOT_FOUND_MESSAGE },
  })
  .middleware(({ context, errors, next }) => {
    // CORS only hides the answer: a form on any `*.tamery.app` page, the share site's included, still posts with the
    // viewer's cookie.
    const origin = context.headers.get('origin')
    if (origin && context.headers.has('cookie') && !isWebOrigin(origin)) {
      throw errors.UNAUTHORIZED()
    }

    return next()
  })
