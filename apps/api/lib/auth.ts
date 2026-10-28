import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import * as schema from '@tamery/db/schema'
import { AUTH_COOKIE_PREFIX } from '@tamery/shared/constants'
import {
  INVITABLE_ROLES,
  isDefaultWorkspaceMetadata,
  WORKSPACE_ROLES,
} from '@tamery/shared/workspace'
import type { WorkspaceRole } from '@tamery/shared/workspace'
import { betterAuth } from 'better-auth'
import { emailHarmony } from 'better-auth-harmony'
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api'
import {
  anonymous,
  bearer,
  emailOTP,
  lastLoginMethod,
  organization,
  twoFactor,
} from 'better-auth/plugins'
import { createAccessControl } from 'better-auth/plugins/access'
import {
  defaultStatements,
  ownerAc,
} from 'better-auth/plugins/organization/access'
import { eq } from 'drizzle-orm'

import { env, nodeEnv } from '~/env'
import { resend, sendEmail } from '~/lib/resend'

import { requireEarlyAccess, requireUserEarlyAccess } from './early-access'
import { redisMemoize } from './redis'
import { deleteSoleMemberWorkspaces, ensureDefaultWorkspace } from './workspace'

const twoFactorPlugin = twoFactor({ allowPasswordless: true })

const workspaceAccess = createAccessControl(defaultStatements)

const workspaceRoles = {
  editor: workspaceAccess.newRole({
    invitation: ['create', 'cancel'],
    member: ['create', 'update', 'delete'],
  }),
  owner: workspaceAccess.newRole(ownerAc.statements),
  viewer: workspaceAccess.newRole({}),
} satisfies Record<WorkspaceRole, unknown>

const isOAuthCallback = ({ path }: { path?: string }) =>
  path?.startsWith('/callback/') === true

export const auth = betterAuth({
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    crossSubDomainCookies: {
      domain: 'tamery.app',
      enabled: true,
    },
    database: {
      generateId: 'uuid',
    },
    // x-forwarded-for has extra hops on Railway, and a multi-value chain is discarded into one global rate-limit bucket. The edge overwrites x-real-ip with the connecting client.
    ipAddress: {
      ipAddressHeaders: ['x-real-ip'],
    },
  },
  appName: 'Tamery',
  basePath: '/auth',
  baseURL: env.API_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: true,
  }) as ReturnType<typeof drizzleAdapter>,
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          await requireUserEarlyAccess(session.userId)

          try {
            await ensureDefaultWorkspace(session.userId)
          } catch (error) {
            console.error(
              `Failed to ensure default workspace on session create: ${error instanceof Error ? error.message : error}`
            )
          }

          return { data: session }
        },
      },
    },
    user: {
      create: {
        before: async (user) => {
          if (user.isAnonymous) {
            throw new APIError('FORBIDDEN', {
              message: 'Tamery is in early access. Sign in to join the list.',
            })
          }

          await requireEarlyAccess(user.email)

          return { data: user }
        },
        after: async (user) => {
          if (resend && !user.isAnonymous) {
            const [firstName = '', ...lastName] = user.name.split(' ')

            await resend.contacts.create({
              email: user.email,
              firstName,
              lastName: lastName.join(' '),
              properties: {
                id: user.id,
              },
            })
          }
        },
      },
      delete: {
        before: async (user) => {
          await deleteSoleMemberWorkspaces(user.id)
        },
      },
      update: {
        after: async (user) => {
          if (nodeEnv !== 'production' || !resend) {
            return
          }

          const [firstName = '', ...lastName] = user.name.split(' ')

          await resend.contacts.update({
            email: user.email,
            firstName,
            lastName: lastName.join(' '),
            properties: {
              id: user.id,
            },
          })
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/email-otp/send-verification-otp') {
        await requireEarlyAccess(ctx.body.email)
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const desktopVersion = ctx.headers?.get('x-desktop-version')

      if (!ctx.context.session) {
        return
      }

      ctx.request?.headers.set('user-id', ctx.context.session.user.id)

      const { session } = ctx.context.session

      if (desktopVersion) {
        const { userId } = session
        await redisMemoize(async () => {
          await db
            .update(users)
            .set({
              desktopVersion,
            })
            .where(eq(users.id, userId))
        }, `desktop-version:${userId}`)
      }
    }),
  },
  onAPIError: {
    onError: async (error) => {
      if (isAPIError(error) && error.statusCode < 500) {
        return
      }

      const text =
        typeof error === 'object' && error !== null
          ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
          : String(error)

      if (env.ALERTS_EMAIL) {
        await sendEmail({
          props: {
            service: 'Better Auth',
            text,
          },
          subject: 'Alert from Better Auth',
          template: 'Alert',
          to: env.ALERTS_EMAIL,
        })
      } else {
        console.error('Alert from Better Auth', { text })
      }
    },
  },
  plugins: [
    bearer(),
    {
      ...twoFactorPlugin,
      hooks: {
        after: [
          // twoFactor() only challenges password sign-ins; without this an email code or Google/GitHub skips TOTP.
          ...twoFactorPlugin.hooks.after.map(({ handler }) => ({
            handler,
            matcher: (context: { path?: string }) =>
              context.path === '/sign-in/email-otp' || isOAuthCallback(context),
          })),
          {
            handler: createAuthMiddleware((ctx) => {
              if (isAPIError(ctx.context.returned)) {
                return Promise.resolve()
              }

              const { pathname, search } = new URL(
                ctx.context.responseHeaders?.get('location') ?? env.MAIN_URL
              )

              return Promise.reject(
                ctx.redirect(
                  `${env.MAIN_URL}/two-factor?redirectPath=${encodeURIComponent(pathname + search)}`
                )
              )
            }),
            matcher: isOAuthCallback,
          },
        ],
      },
    },
    emailOTP({
      sendVerificationOTP: async ({ email, otp }) => {
        await sendEmail({
          props: { code: otp },
          subject: `${otp} is your Tamery code`,
          template: 'SignInCode',
          to: email,
        })
      },
    }),
    organization({
      ac: workspaceAccess,
      allowUserToCreateOrganization: false,
      disableOrganizationDeletion: true,
      organizationHooks: {
        beforeCreateInvitation: async ({
          invitation,
          organization: workspace,
        }) => {
          if (
            !(INVITABLE_ROLES as readonly string[]).includes(invitation.role)
          ) {
            throw APIError.from('BAD_REQUEST', {
              code: 'INVALID_ROLE',
              message: 'Invite people as an editor or a viewer.',
            })
          }

          const [row, invitee] = await Promise.all([
            db.query.workspaces.findFirst({
              columns: { metadata: true },
              where: { id: { eq: workspace.id } },
            }),
            db.query.users.findFirst({
              columns: { id: true },
              where: {
                email: { eq: invitation.email },
                isAnonymous: { OR: [{ eq: false }, { isNull: true }] },
              },
            }),
          ])

          if (row && isDefaultWorkspaceMetadata(row.metadata)) {
            throw APIError.from('BAD_REQUEST', {
              code: 'PERSONAL_WORKSPACE',
              message:
                'Your Personal workspace can’t be shared. Create a workspace to invite people.',
            })
          }

          if (!invitee) {
            throw APIError.from('BAD_REQUEST', {
              code: 'USER_NOT_FOUND',
              message:
                'No Tamery account uses this email. Ask them to sign up first.',
            })
          }
        },
        beforeUpdateMemberRole: ({ newRole }) => {
          if (!(WORKSPACE_ROLES as readonly string[]).includes(newRole)) {
            throw APIError.from('BAD_REQUEST', {
              code: 'INVALID_ROLE',
              message: 'A member is an owner, an editor or a viewer.',
            })
          }

          return Promise.resolve()
        },
      },
      roles: workspaceRoles,
      schema: {
        invitation: {
          fields: {
            organizationId: 'workspaceId',
          },
        },
        member: {
          fields: {
            organizationId: 'workspaceId',
          },
        },
        organization: {
          modelName: 'workspace',
        },
        session: {
          fields: {
            activeOrganizationId: 'activeWorkspaceId',
          },
        },
      },
      sendInvitationEmail: async ({
        email,
        id,
        inviter,
        organization: workspace,
        role,
      }) => {
        await sendEmail({
          props: {
            inviterName: inviter.user.name,
            role,
            url: `${env.MAIN_URL}/invitation/${id}`,
            workspaceName: workspace.name,
          },
          subject: `${inviter.user.name} invited you to ${workspace.name} on Tamery`,
          template: 'WorkspaceInvitation',
          to: email,
        })
      },
    }),
    lastLoginMethod(),
    emailHarmony(),
    anonymous(),
  ],
  secret: env.BETTER_AUTH_SECRET,
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID ?? '',
      clientSecret: env.GITHUB_CLIENT_SECRET ?? '',
      enabled: !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET,
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      // An ID token signs in without the OAuth callback, which is where the TOTP challenge hooks in.
      disableIdTokenSignIn: true,
      enabled: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
      prompt: 'select_account',
    },
  },
  trustedOrigins: [
    'https://tamery.app',
    'https://*.tamery.app',
    'file://',
    ...(nodeEnv === 'development' ? ['http://localhost:*'] : []),
  ],
  user: {
    additionalFields: {
      desktopVersion: {
        input: false,
        required: false,
        type: 'string',
      },
      stripeCustomerId: {
        input: false,
        required: false,
        returned: false,
        type: 'string',
      },
    },
    deleteUser: {
      enabled: true,
    },
  },
})
