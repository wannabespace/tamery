import { os } from '@orpc/server'
import { SESSION_NOT_FOUND_MESSAGE } from '@tamery/shared/constants'
import { isDevelopmentOrigin, ORIGINS } from '@tamery/shared/origins'
import { type } from 'arktype'

import { env, nodeEnv } from '~/env'

import type { Context } from './context'

export const orpc = os.$context<Context>()

export const isWebOrigin = (origin: string) =>
  origin === ORIGINS.web ||
  (nodeEnv === 'development' && isDevelopmentOrigin(origin))

const sessionResponse = type({ session: { userId: 'string' } })

const getSession = async (headers: Headers) => {
  const res = await fetch(`${env.API_URL}/auth/get-session`, {
    headers: {
      authorization: headers.get('authorization') ?? '',
      cookie: headers.get('cookie') ?? '',
    },
  })

  if (!res.ok) {
    return null
  }

  const data = await res.json()
  return data ? sessionResponse.assert(data).session : null
}

export const authMiddleware = orpc
  .errors({
    UNAUTHORIZED: { message: SESSION_NOT_FOUND_MESSAGE },
  })
  .middleware(async ({ context, errors, next }) => {
    // CORS only hides the answer: a form on any `*.tamery.app` page, the share site's included, still posts with the
    // viewer's cookie.
    const origin = context.headers.get('origin')
    if (origin && context.headers.has('cookie') && !isWebOrigin(origin)) {
      throw errors.UNAUTHORIZED()
    }

    const session = await getSession(context.headers)

    if (!session) {
      throw errors.UNAUTHORIZED()
    }

    context.addLogData({ userId: session.userId })

    return next({
      context: {
        session,
      },
    })
  })
