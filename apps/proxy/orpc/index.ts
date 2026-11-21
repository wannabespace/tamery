import { ORPCError } from '@orpc/client'
import { os } from '@orpc/server'
import { SESSION_NOT_FOUND_MESSAGE } from '@tamery/shared/constants'
import { isDevelopmentOrigin, ORIGINS } from '@tamery/shared/origins'

import { createApiClient } from '~/api-client'
import { nodeEnv } from '~/env'

import type { Context } from './context'

export const orpc = os.$context<Context>()

export const isWebOrigin = (origin: string) =>
  origin === ORIGINS.web ||
  (nodeEnv === 'development' && isDevelopmentOrigin(origin))

// Not `/auth/get-session`: better-auth rate-limits it per IP, and every viewer's check leaves from proxy's NAT address.
const getViewer = async (headers: Headers) => {
  try {
    return await createApiClient({
      authorization: headers.get('authorization'),
      cookie: headers.get('cookie'),
    }).account.viewer()
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') {
      return null
    }
    throw error
  }
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

    const viewer = await getViewer(context.headers)

    if (!viewer) {
      throw errors.UNAUTHORIZED()
    }

    context.addLogData({ userId: viewer.id })

    return next({
      context: {
        session: { userId: viewer.id },
      },
    })
  })
