import { ORPCError, os } from '@orpc/server'
import { SESSION_NOT_FOUND_MESSAGE } from '@tamery/shared/constants'
import { decrypt } from '@tamery/shared/crypto-node'
import type { Permissions } from '@tamery/shared/permissions'
import { getPermissions } from '@tamery/shared/permissions'
import { isAPIError } from 'better-auth/api'
import { memoize } from 'memoza'
import { createPermix } from 'permix/orpc'

import { auth } from '~/lib/auth'
import { workspaceEncryptionKey } from '~/lib/encryption-key'
import { redis } from '~/lib/redis'
import { getSubscription } from '~/lib/subscription'

import type { Context } from './context'
import type { router } from './routers'

export { getSubscription } from '~/lib/subscription'

export const orpc = os.$context<Context>()

// Answered as CONFLICT, not Better Auth's BAD_REQUEST: the API alerts on every 400, and these are an ordinary answer to what the user typed.
const CONFLICT_CODES: ReadonlySet<string> = new Set([
  'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION',
  'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION',
])

export const viaAuth = async <T>(promise: Promise<T>) => {
  try {
    return await promise
  } catch (error) {
    throw isAPIError(error)
      ? new ORPCError(
          CONFLICT_CODES.has(error.body?.code ?? '')
            ? 'CONFLICT'
            : String(error.status),
          {
            message: error.message
              .replaceAll('organization', 'workspace')
              .replaceAll('Organization', 'Workspace')
              .replace('User is', 'They are'),
          }
        )
      : error
  }
}

export const getWorkspaceSecret = memoize(workspaceEncryptionKey.get, {
  maxAge: 5 * 60 * 1000,
})

export const decryptConnectionString = async ({
  encryptedText,
  workspaceId,
}: {
  encryptedText: string
  workspaceId: string
}) => decrypt({ encryptedText, secret: await getWorkspaceSecret(workspaceId) })

const getSession = (headers: Headers) => auth.api.getSession({ headers })

const sessionOrpc = orpc.errors({
  UNAUTHORIZED: { message: SESSION_NOT_FOUND_MESSAGE },
})

// Every other procedure carries what a user typed or what is encrypted at rest: connection strings, SQL, chat text, share passwords.
const LOGGED_PAYLOADS: ReadonlySet<string> = new Set([
  'banner',
  'connectionsResources',
  'releases',
  'repo',
  'usage',
  'userCount',
  'workspaces',
] satisfies (keyof typeof router)[])

const logMiddleware = orpc.middleware(
  async ({ context, next, path }, input) => {
    // oxlint-disable-next-line node/callback-return -- middleware post-processes next()
    const result = await next()

    if (LOGGED_PAYLOADS.has(path[0] ?? '') && path.at(-1) !== 'sync') {
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
  }
)

export const authMiddleware = logMiddleware.use(
  sessionOrpc.middleware(async ({ context, errors, next }) => {
    const session = await getSession(context.headers)

    if (!session) {
      throw errors.UNAUTHORIZED()
    }

    context.addLogData({ userId: session.user.id })

    return next({
      context: {
        ...session,
        decryptConnectionString,
        getWorkspaceSecret,
      },
    })
  })
)

export const accountMiddleware = authMiddleware.use(({ context, next }) => {
  if (context.user.isAnonymous) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Sign in with an account to continue.',
    })
  }

  return next()
})

export const optionalAuthMiddleware = logMiddleware.use(
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
  })
)

export const permix = createPermix<Permissions>({
  onForbidden: ({ context }) => {
    if (context.user.isAnonymous) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Sign in with an account to use this feature.',
      })
    }

    throw new ORPCError('FORBIDDEN', {
      message:
        'To use this feature, a subscription is required. Please subscribe to a Pro plan to continue.',
    })
  },
}).contextKey('permissions')

export const permissionsMiddleware = logMiddleware.use(
  sessionOrpc.middleware(async ({ context, errors, next }) => {
    const session = await getSession(context.headers)

    if (!session) {
      throw errors.UNAUTHORIZED()
    }

    const subscription = await getSubscription(session.user.id)

    context.addLogData({
      userId: session.user.id,
      ...(subscription && {
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      }),
    })

    return next({
      context: {
        ...session,
        decryptConnectionString,
        getWorkspaceSecret,
        ...permix.setupContext(
          getPermissions({ subscription, user: session.user })
        ),
      },
    })
  })
)

export const cacheMiddleware = (ttl: number = 60 * 60 * 24) =>
  logMiddleware.use(
    orpc.middleware(async ({ next, path }, input, done) => {
      const cacheKey = path.join('/') + JSON.stringify(input)
      const cached = await redis.get(cacheKey)
      if (cached) {
        return done({ output: JSON.parse(cached) })
      }

      // oxlint-disable-next-line node/callback-return -- middleware caches after next()
      const result = await next()

      await redis.setEx(cacheKey, ttl, JSON.stringify(result.output))

      return result
    })
  )
