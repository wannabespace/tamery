import { AsyncLocalStorage } from 'node:async_hooks'

import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { getAuthenticatorName, passkey } from '@better-auth/passkey'
import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import * as schema from '@tamery/db/schema'
import {
  AUTH_COOKIE_PREFIX,
  SOCIAL_PROVIDER_LABELS,
} from '@tamery/shared/constants'
import { formatDeviceLabel } from '@tamery/shared/device-label'
import { ORIGINS } from '@tamery/shared/origins'
import {
  invitableRole,
  isDefaultWorkspaceMetadata,
} from '@tamery/shared/workspace'
import type { WorkspaceRole } from '@tamery/shared/workspace'
import type { Session } from 'better-auth'
import { betterAuth } from 'better-auth'
import { emailHarmony } from 'better-auth-harmony'
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  isAPIError,
} from 'better-auth/api'
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
import { locateIp } from '~/lib/geo-ip'
import { posthog } from '~/lib/posthog'
import { resend, sendEmail } from '~/lib/resend'

import { redisMemoize } from './redis'
import {
  deleteSoleMemberWorkspaces,
  ensureDefaultWorkspace,
  getLastOwnedSharedWorkspaceName,
} from './workspace'

const twoFactorPlugin = twoFactor({ allowPasswordless: true })

const mainUrl = new URL(env.MAIN_URL)

const PASSKEY_EXISTS_MESSAGE =
  'This device or password manager already has a passkey for your account.'

const passkeyPlugin = passkey({
  authentication: {
    // A passkey sign-in skips the TOTP challenge, so it must carry its own second factor (fingerprint, face or device PIN).
    afterVerification: ({ verification }) => {
      if (!verification.authenticationInfo.userVerified) {
        throw new APIError('UNAUTHORIZED', {
          message: 'Unlock your passkey with your fingerprint, face or PIN.',
        })
      }
    },
  },
  authenticatorSelection: {
    residentKey: 'required',
    userVerification: 'required',
  },
  // Every sign-in runs on the site, not on the API's own host the plugin would default to.
  origin: mainUrl.origin,
  registration: {
    afterVerification: async ({ ctx, user, verification }) => {
      const { aaguid, credentialDeviceType } =
        verification.registrationInfo ?? {}

      // excludeCredentials is only a request some password managers ignore. Device-bound passkeys stay allowed: two security keys of one model, or one per computer, are real backups.
      if (credentialDeviceType === 'multiDevice' && aaguid) {
        const duplicate = await ctx.context.adapter.findOne({
          model: 'passkey',
          where: [
            { field: 'userId', value: user.id },
            { field: 'aaguid', value: aaguid },
            { field: 'deviceType', value: credentialDeviceType },
          ],
        })

        if (duplicate) {
          throw new APIError('BAD_REQUEST', { message: PASSKEY_EXISTS_MESSAGE })
        }
      }

      return {
        name:
          getAuthenticatorName(aaguid) ??
          formatDeviceLabel(ctx.headers?.get('user-agent') ?? ''),
      }
    },
  },
  rpID: mainUrl.hostname,
})

const workspaceAccess = createAccessControl(defaultStatements)

const providerLabels: Partial<Record<string, string>> = SOCIAL_PROVIDER_LABELS

const authRequest = new AsyncLocalStorage<{ signUp: boolean }>()

const findUser = (userId: string) =>
  db.query.users.findFirst({
    columns: { email: true, twoFactorEnabled: true },
    where: { id: { eq: userId } },
  })

export const sendNewSignInEmail = async ({
  ipAddress,
  userAgent,
  userId,
  signedInWithPasskey = false,
}: Pick<Session, 'ipAddress' | 'userAgent' | 'userId'> & {
  signedInWithPasskey?: boolean
}) => {
  const user = await findUser(userId)

  if (!user) {
    return
  }

  await sendEmail({
    props: {
      device: formatDeviceLabel(userAgent ?? ''),
      ipAddress: ipAddress ?? '',
      location: locateIp(ipAddress ?? ''),
      signedInWithPasskey,
      twoFactorEnabled: user.twoFactorEnabled === true,
    },
    subject: 'New sign-in to your Tamery account',
    template: 'NewSignIn',
    to: user.email,
  })
}

const isOAuthCallback = ({ path }: { path?: string }) =>
  path?.startsWith('/callback/') === true

export const auth = betterAuth({
  account: {
    accountLinking: {
      // An email code needs no account row, so disconnecting the last provider locks nobody out.
      allowUnlinkingAll: true,
    },
  },
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
  // Membership changes go through the workspaces oRPC procedures only: they sync members' devices and revoke shares, which these endpoints would skip.
  disabledPaths: [
    '/organization/accept-invitation',
    '/organization/cancel-invitation',
    '/organization/invite-member',
    '/organization/leave',
    '/organization/reject-invitation',
    '/organization/remove-member',
    '/organization/update',
    '/organization/update-member-role',
  ],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    usePlural: true,
  }) as ReturnType<typeof drizzleAdapter>,
  databaseHooks: {
    account: {
      create: {
        after: async (account, context) => {
          if (!context || authRequest.getStore()?.signUp) {
            return
          }

          const user = await findUser(account.userId)

          if (!user) {
            return
          }

          const provider =
            providerLabels[account.providerId] ?? account.providerId
          await sendEmail({
            props: { provider },
            subject: `${provider} was connected to your Tamery account`,
            template: 'SignInMethodLinked',
            to: user.email,
          })
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
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
        after: async (user) => {
          const request = authRequest.getStore()

          if (request) {
            request.signUp = true
          }

          posthog?.capture({
            distinctId: user.id,
            event: 'signed_up',
            properties: { app: 'api' },
          })

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
        before: (user) => deleteSoleMemberWorkspaces(user.id),
      },
      update: {
        after: async (user, context) => {
          if (context?.path.startsWith('/two-factor/')) {
            const enabled = user.twoFactorEnabled === true
            await sendEmail({
              props: { enabled },
              subject: `Two-factor authentication turned ${enabled ? 'on' : 'off'}`,
              template: 'TwoFactorChanged',
              to: user.email,
            })
          }

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
          // Must run after twoFactor's hook, which clears newSession while a challenge is pending; the global hooks.after runs before plugin hooks.
          {
            handler: createAuthMiddleware(async (ctx) => {
              const { newSession, session } = ctx.context

              if (!newSession || session || authRequest.getStore()?.signUp) {
                return
              }

              await sendNewSignInEmail({
                ...newSession.session,
                signedInWithPasskey:
                  ctx.path === '/passkey/verify-authentication',
              })
            }),
            matcher: () => true,
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
      allowUserToCreateOrganization: false,
      disableOrganizationDeletion: true,
      organizationHooks: {
        beforeCreateInvitation: async ({ organization: workspace }) => {
          const row = await db.query.workspaces.findFirst({
            columns: { metadata: true },
            where: { id: { eq: workspace.id } },
          })

          if (row && isDefaultWorkspaceMetadata(row.metadata)) {
            throw APIError.from('FORBIDDEN', {
              code: 'PERSONAL_WORKSPACE',
              message:
                'Your Personal workspace can’t be shared. Create a workspace to invite people.',
            })
          }
        },
      },
      roles: {
        admin: workspaceAccess.newRole({
          invitation: ['create', 'cancel'],
          member: ['create', 'update', 'delete'],
        }),
        editor: workspaceAccess.newRole({}),
        owner: workspaceAccess.newRole(ownerAc.statements),
        viewer: workspaceAccess.newRole({}),
      } satisfies Record<WorkspaceRole, unknown>,
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
            role: invitableRole.assert(role),
            url: `${env.MAIN_URL}/invitation/${id}`,
            workspaceName: workspace.name,
          },
          subject: `${inviter.user.name} invited you to ${workspace.name} on Tamery`,
          template: 'WorkspaceInvitation',
          to: email,
        })
      },
    }),
    {
      ...passkeyPlugin,
      endpoints: {
        ...passkeyPlugin.endpoints,
        hasPendingTwoFactorPasskey: createAuthEndpoint(
          '/passkey/pending-two-factor',
          { method: 'GET' },
          async (ctx) => {
            // 'two_factor' is twoFactor()'s challenge cookie, whose name better-auth doesn't export.
            const challengeId = await ctx.getSignedCookie(
              ctx.context.createAuthCookie('two_factor').name,
              ctx.context.secret
            )
            const challenge = challengeId
              ? await ctx.context.internalAdapter.findVerificationValue(
                  challengeId
                )
              : null
            const challengedPasskey = challenge
              ? await ctx.context.adapter.findOne({
                  model: 'passkey',
                  where: [{ field: 'userId', value: challenge.value }],
                })
              : null

            return { hasPasskey: !!challengedPasskey }
          }
        ),
      },
      hooks: {
        after: [
          // The plugin writes passkeys through the raw adapter, so databaseHooks never see them.
          {
            handler: createAuthMiddleware(async (ctx) => {
              const user = ctx.context.session?.user

              if (!user || isAPIError(ctx.context.returned)) {
                return
              }

              await sendEmail({
                subject: 'A passkey was added to your Tamery account',
                template: 'PasskeyAdded',
                to: user.email,
              })
            }),
            matcher: (context: { path?: string }) =>
              context.path === '/passkey/verify-registration',
          },
        ],
      },
    },
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
    ORIGINS.site,
    ORIGINS.web,
    'file://',
    ...(nodeEnv === 'development'
      ? ['http://localhost:*', 'https://*.local.tamery.app']
      : []),
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
      afterDelete: async (user) => {
        await Promise.all([
          sendEmail({
            subject: 'Your Tamery account was deleted',
            template: 'AccountDeleted',
            to: user.email,
          }),
          resend?.contacts.remove({ email: user.email }),
        ])
      },
      // Not the database delete hook: Better Auth deletes the user's sessions and accounts before that one runs, so refusing there would sign them out of an account it keeps.
      beforeDelete: async (user) => {
        const lastOwned = await getLastOwnedSharedWorkspaceName(user.id)

        if (lastOwned) {
          throw APIError.from('BAD_REQUEST', {
            code: 'LAST_WORKSPACE_OWNER',
            message: `Make another member an owner of ${lastOwned} before deleting your account.`,
          })
        }
      },
      enabled: true,
    },
  },
})

export const handleAuth = (request: Request) =>
  authRequest.run({ signUp: false }, () => auth.handler(request))
