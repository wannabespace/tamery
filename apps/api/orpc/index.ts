import { db } from '@conar/db'
import { subscriptions } from '@conar/db/schema'
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  LATEST_VERSION_BEFORE_SUBSCRIPTION,
} from '@conar/shared/constants'
import { ORPCError, os } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { memoize } from 'memoza'

import { auth } from '~/lib/auth'
import { workspaceEncryptionKey } from '~/lib/encryption-key'
import { redis } from '~/lib/redis'

import type { Context } from './context'

export const orpc = os.$context<Context>()

export const getUserSecret = memoize(
  (userId: string) => workspaceEncryptionKey.getForUser(userId),
  {
    maxAge: 5 * 60 * 1000,
  },
) // 5 minutes

async function getSession(headers: Headers) {
  const session = await auth.api.getSession({ headers })

  if (!session) {
    throw new ORPCError('UNAUTHORIZED', {
      message: 'We could not find your session. Please sign in again.',
    })
  }

  return session
}

export const logMiddleware = orpc.middleware(async ({ context, next }, input) => {
  const result = await next()

  if (
    !context.request.url.endsWith('/sync') &&
    !context.request.url.endsWith('/resolveConnectionString')
  ) {
    context.addLogData({
      input,
      output:
        (Array.isArray(result.output) && result.output.length > 0) ||
        (typeof result.output === 'object' &&
          result.output !== null &&
          Object.keys(result.output).length > 0) ||
        (!Array.isArray(result.output) &&
          typeof result.output !== 'object' &&
          result.output !== null &&
          !!result.output)
          ? result.output
          : undefined,
    })
  }

  return result
})

export const authMiddleware = logMiddleware.concat(
  orpc.middleware(async ({ context, next }) => {
    const session = await getSession(context.headers)

    context.addLogData({ userId: session.user.id })

    return next({
      context: {
        ...session,
        getUserSecret: () => getUserSecret(session.user.id),
      },
    })
  }),
)

export const optionalAuthMiddleware = logMiddleware.concat(
  orpc.middleware(async ({ context, next }) => {
    const session = await getSession(context.headers).catch(() => null)

    if (session) {
      context.addLogData({ userId: session.user.id })
    }

    return next({
      context: {
        session: session?.session ?? null,
        user: session?.user ?? null,
      },
    })
  }),
)

export async function getSubscription(userId: string) {
  const userSubscriptions = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))

  return (
    userSubscriptions.find(s =>
      ACTIVE_SUBSCRIPTION_STATUSES.includes(
        s.status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number],
      ),
    ) ?? null
  )
}

export const subscriptionMiddleware = logMiddleware.concat(
  orpc.middleware(async ({ context, next }) => {
    const session = await getSession(context.headers)
    const minorVersion = context.parsedAppVersion?.minor ?? 0
    const subscription = await getSubscription(session.user.id)

    if (session) {
      context.addLogData({ userId: session.user.id })
    }

    if (!subscription) {
      throw new ORPCError('FORBIDDEN', {
        message:
          minorVersion < LATEST_VERSION_BEFORE_SUBSCRIPTION
            ? 'To use this feature, a subscription is now required. Please update to the latest version of the app and subscribe to a Pro plan to continue.'
            : 'To use this feature, a subscription is required. Please subscribe to a Pro plan to continue.',
      })
    }

    context.addLogData({
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    })

    return next({
      context: {
        ...session,
        subscription,
        getUserSecret: () => getUserSecret(session.user.id),
      },
    })
  }),
)

export const optionalSubscriptionMiddleware = logMiddleware.concat(
  orpc.middleware(async ({ context, next }) => {
    const session = await getSession(context.headers)
    const subscription = await getSubscription(session.user.id)

    context.addLogData({ userId: session.user.id })

    return next({
      context: {
        ...session,
        subscription,
        getUserSecret: () => getUserSecret(session.user.id),
      },
    })
  }),
)

export function cacheMiddleware(ttl: number = 60 * 60 * 24) {
  return logMiddleware.concat(
    orpc.middleware(async ({ next, path }, input, output) => {
      const cacheKey = path.join('/') + JSON.stringify(input)
      const cached = await redis.get(cacheKey)
      if (cached) {
        return output(JSON.parse(cached))
      }

      const result = await next()

      await redis.setex(cacheKey, ttl, JSON.stringify(result.output))

      return result
    }),
  )
}
