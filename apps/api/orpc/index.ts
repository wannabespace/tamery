import { normalizeIP } from '@better-auth/core/utils/ip'
import { ORPCError, os } from '@orpc/server'
import type { AiKey } from '@tamery/ai/models'
import {
  CLIENT_IP_HEADER,
  SESSION_NOT_FOUND_MESSAGE,
} from '@tamery/shared/constants'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { decrypt } from '@tamery/shared/crypto-node'
import type { Permissions } from '@tamery/shared/permissions'
import { getPermissions } from '@tamery/shared/permissions'
import { isAPIError } from 'better-auth/api'
import { createPermix } from 'permix/orpc'

import { aiKey, payForAi } from '~/lib/ai-key'
import { auth } from '~/lib/auth'
import { credits } from '~/lib/credits'
import { workspaceEncryptionKey } from '~/lib/encryption-key'
import { redis } from '~/lib/redis'
import { sessionActivity } from '~/lib/session-activity'
import { getSubscription } from '~/lib/subscription'

import type { Context } from './context'
import type { router } from './routers'

export { getSubscription } from '~/lib/subscription'

export const orpc = os.$context<Context>()

type AuthErrorCode = keyof typeof auth.$ERROR_CODES

// Answered as CONFLICT, not Better Auth's BAD_REQUEST: the API alerts on every 400, and these are an ordinary answer to what the user typed.
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
    void sessionActivity.touch(
      session.session.id,
      context.headers.get(CLIENT_IP_HEADER)
    )

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

/** A rate limit key for `authMiddleware` procedures: a guest can mint a new user id at will, so guests are keyed by network. */
export const callerRateLimitKey = ({
  context,
}: {
  context: {
    headers: Headers
    user: { id: string; isAnonymous?: boolean | null }
  }
}) =>
  context.user.isAnonymous
    ? `ip:${normalizeIP(context.headers.get(CLIENT_IP_HEADER) ?? 'unknown')}`
    : context.user.id

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
  onForbidden: ({ context, path }) => {
    if (context.user.isAnonymous) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Sign in with an account to use this feature.',
      })
    }

    throw new ORPCError('FORBIDDEN', {
      message:
        path === 'ai.chat.use'
          ? 'To use the AI chat, subscribe to a Pro plan or add your own AI provider key in Settings → AI.'
          : 'To use this feature, a subscription is required. Please subscribe to a Pro plan to continue.',
    })
  },
}).contextKey('permissions')

const permissionsWith = ({ aiKeys: readsAiKeys }: { aiKeys: boolean }) =>
  logMiddleware.use(
    sessionOrpc.middleware(async ({ context, errors, next }) => {
      const session = await getSession(context.headers)

      if (!session) {
        throw errors.UNAUTHORIZED()
      }

      const [subscription, aiKeys] = await Promise.all([
        getSubscription(session.user.id),
        readsAiKeys
          ? aiKey.enabled(session.user.id)
          : Promise.resolve<AiKey[]>([]),
      ])

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
          aiKeys,
          decryptConnectionString,
          subscription,
          ...permix.setupContext(
            getPermissions({
              hasAiKey: aiKeys.length > 0,
              subscription,
              user: session.user,
            })
          ),
        },
      })
    })
  )

/** Reads no AI keys, so `ai.chat.use` fails for a user who has only a key: a procedure that checks it uses `aiPermissionsMiddleware`. */
export const permissionsMiddleware = permissionsWith({ aiKeys: false })

/** Also reads the user's enabled AI keys, which `ai.chat.use` and `paidAiMiddleware` both go by. */
export const aiPermissionsMiddleware = permissionsWith({ aiKeys: true })

/** The gate of every AI call Tamery may pay for, after a permissions middleware: `context.payer` is the user's keys, else Tamery while their plan's budget or credits last, holding one of the user's Tamery-paid slots until the handler returns (a chat turn holds its own while it streams). Under `permissionsMiddleware` no key is read, so the call is always Tamery's. */
export const paidAiMiddleware = os
  .$context<Parameters<typeof payForAi>[0]>()
  .middleware(async ({ context, next }) => {
    const payer = await payForAi(context)
    if (!payer) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: AI_BUDGET_SPENT_MESSAGE,
      })
    }
    return payer.keys.length > 0
      ? next({ context: { payer } })
      : credits.inPaidSlot(context.user.id, () => next({ context: { payer } }))
  })

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
