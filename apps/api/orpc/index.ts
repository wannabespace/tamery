import { ORPCError, os } from '@orpc/server'
import { SESSION_NOT_FOUND_MESSAGE } from '@tamery/shared/constants'
import { decrypt } from '@tamery/shared/crypto-node'
import type { Permissions } from '@tamery/shared/permissions'
import { getPermissions } from '@tamery/shared/permissions'
import { isAPIError } from 'better-auth/api'
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
type AuthErrorCode = keyof typeof auth.$ERROR_CODES

const CONFLICT_CODES: ReadonlySet<string> = new Set([
  'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION',
  'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION',
] satisfies AuthErrorCode[])

const WORKSPACE_ERROR_MESSAGES: Partial<Record<string, string>> = {
  INVITATION_LIMIT_REACHED: 'This workspace has too many open invitations.',
  INVITATION_NOT_FOUND:
    'This invitation is no longer open. Ask for a new one if you still need access.',
  INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
    'The person who invited you has left the workspace. Ask for a new invitation.',
  MEMBER_NOT_FOUND: 'They are no longer a member of this workspace.',
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: 'This workspace is full.',
  ORGANIZATION_NOT_FOUND: 'Workspace not found',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
    'They are already a member of this workspace.',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION:
    'They are already invited to this workspace.',
  YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION:
    'You are not a member of this workspace.',
  YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
    'Only admins and owners can cancel invitations.',
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER:
    'Only admins and owners can remove members, and only owners can remove an owner.',
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
    'Only owners can invite with this role.',
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
    'Only admins and owners can invite people.',
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER:
    'Only admins and owners can change roles, and only owners can change an owner’s role or make someone an owner.',
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
    'This invitation was sent to another email. Sign in with that one to answer it.',
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
    'Make another member an owner first: a workspace always keeps one.',
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
    'Make another member an owner first: a workspace always keeps one.',
} satisfies Partial<Record<AuthErrorCode, string>>

export const decryptConnectionString = async ({
  encryptedText,
  workspaceId,
}: {
  encryptedText: string
  workspaceId: string
}) =>
  decrypt({
    encryptedText,
    secret: await workspaceEncryptionKey.get(workspaceId),
  })

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

    try {
      return await next({
        context: {
          ...session,
          decryptConnectionString,
        },
      })
    } catch (error) {
      if (!isAPIError(error)) {
        throw error
      }

      const code = error.body?.code ?? ''

      throw new ORPCError(
        CONFLICT_CODES.has(code) ? 'CONFLICT' : String(error.status),
        { message: WORKSPACE_ERROR_MESSAGES[code] ?? error.message }
      )
    }
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
