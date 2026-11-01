import { os } from '@orpc/server'
import { SESSION_NOT_FOUND_MESSAGE } from '@tamery/shared/constants'
import { ORIGINS } from '@tamery/shared/origins'
import { type } from 'arktype'

import { env } from '~/env'

import type { Context } from './context'

export const orpc = os.$context<Context>()

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
    // The share site renders other people's rows: a script injected there must not query with the viewer's session.
    if (context.headers.get('origin') === ORIGINS.share) {
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
