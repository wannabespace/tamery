import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import * as schema from '@tamery/db/schema'
import {
  AUTH_COOKIE_PREFIX,
  SOCIAL_PROVIDER_LABELS,
} from '@tamery/shared/constants'
import { formatDeviceLabel } from '@tamery/shared/device-label'
import { getPermissions } from '@tamery/shared/permissions'
import type { Session } from 'better-auth'
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
import { eq } from 'drizzle-orm'

import { env, nodeEnv } from '~/env'
import { userEncryptionKey } from '~/lib/encryption-key'
import { locateIp } from '~/lib/geo-ip'
import { posthog } from '~/lib/posthog'
import { resend, sendEmail } from '~/lib/resend'

import { requireEarlyAccess, requireUserEarlyAccess } from './early-access'
import { redisMemoize } from './redis'
import { getSubscription } from './subscription'
import { ensureDefaultWorkspace } from './workspace'

const twoFactorPlugin = twoFactor({ allowPasswordless: true })

const providerLabels: Partial<Record<string, string>> = SOCIAL_PROVIDER_LABELS

// Keyed by the request's auth context: better-call hands the same object to the endpoint, its database hooks and the after hooks.
const signUpRequests = new WeakSet<object>()

const findUser = (userId: string) =>
  db.query.users.findFirst({
    columns: { email: true, twoFactorEnabled: true },
    where: { id: { eq: userId } },
  })

export const sendNewSignInEmail = async ({
  ipAddress,
  userAgent,
  userId,
}: Pick<Session, 'ipAddress' | 'userAgent' | 'userId'>) => {
  const user = await findUser(userId)

  if (!user) {
    return
  }

  await sendEmail({
    props: {
      device: formatDeviceLabel(userAgent ?? ''),
      ipAddress: ipAddress ?? '',
      location: locateIp(ipAddress ?? ''),
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
    account: {
      create: {
        after: async (account, context) => {
          if (!context || signUpRequests.has(context.context)) {
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
        after: async (user, context) => {
          if (context) {
            signUpRequests.add(context.context)
          }

          await userEncryptionKey.create(user.id).catch(async (error) => {
            console.error(
              `Failed to create user encryption key: ${error instanceof Error ? error.message : error}`,
              error instanceof Error && error.cause ? error.cause : undefined
            )
            await db.delete(users).where(eq(users.id, user.id))
            throw error
          })

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
          // Must run after twoFactor's hook, which clears newSession while a challenge is pending; the global hooks.after runs before plugin hooks.
          {
            handler: createAuthMiddleware(async (ctx) => {
              const { newSession, session } = ctx.context

              if (!newSession || session || signUpRequests.has(ctx.context)) {
                return
              }

              await sendNewSignInEmail(newSession.session)
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
      allowUserToCreateOrganization: async (user) =>
        getPermissions({
          subscription: await getSubscription(user.id),
          user: { isAnonymous: user.isAnonymous },
        }).workspace.create === true,
      disableOrganizationDeletion: true,
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
      enabled: true,
    },
  },
})
