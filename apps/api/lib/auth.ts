import { apiKey } from '@better-auth/api-key'
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2'
import { db } from '@conar/db'
import { users } from '@conar/db/schema'
import * as schema from '@conar/db/schema'
import { API_KEY_PERMISSIONS, AUTH_COOKIE_PREFIX } from '@conar/shared/constants'
import { betterAuth } from 'better-auth'
import { emailHarmony } from 'better-auth-harmony'
import { createAuthMiddleware } from 'better-auth/api'
import { anonymous, bearer, lastLoginMethod, organization, twoFactor } from 'better-auth/plugins'
import { eq } from 'drizzle-orm'

import { env, nodeEnv } from '~/env'
import { resend, sendEmail } from '~/lib/resend'

import { redisMemoize } from './redis'
import { ensureDefaultWorkspace } from './workspace'

export const auth = betterAuth({
  appName: 'Conar',
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.API_URL,
  basePath: '/auth',
  plugins: [
    bearer(),
    twoFactor(),
    organization({
      schema: {
        organization: {
          modelName: 'workspace',
        },
        member: {
          fields: {
            organizationId: 'workspaceId',
          },
        },
        invitation: {
          fields: {
            organizationId: 'workspaceId',
          },
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
    apiKey({
      defaultPrefix: nodeEnv === 'production' ? 'tmy_' : 'tmy_test_',
      permissions: {
        defaultPermissions: API_KEY_PERMISSIONS,
      },
      startingCharactersConfig: {
        charactersLength: nodeEnv === 'production' ? 20 : 15,
      },
      requireName: true,
      schema: {
        apikey: {
          modelName: 'api_key',
        },
      },
    }),
  ],
  user: {
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      stripeCustomerId: {
        type: 'string',
        returned: false,
        input: false,
        required: false,
        fieldName: 'stripe_customer_id',
      },
      desktopVersion: {
        fieldName: 'desktop_version',
        type: 'string',
        input: false,
        required: false,
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async ctx => {
      const desktopVersion = ctx.headers?.get('x-desktop-version')

      if (!ctx.context.session) {
        return
      }

      ctx.request?.headers.set('user-id', ctx.context.session.user.id)

      if (desktopVersion) {
        await redisMemoize(async () => {
          await db
            .update(users)
            .set({
              desktopVersion,
            })
            .where(eq(users.id, ctx.context.session!.user.id))
        }, `desktop-version:${ctx.context.session.user.id}`)
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async user => {
          // Creates the default workspace with its encryption key; without a key the user cannot store connections.
          await ensureDefaultWorkspace(user.id).catch(async error => {
            console.error(
              `Failed to create default workspace: ${error instanceof Error ? error.message : error}`,
              error instanceof Error && error.cause ? error.cause : undefined,
            )
            await db.delete(users).where(eq(users.id, user.id))
            throw error
          })

          if (resend) {
            const [firstName, ...lastName] = user.name.split(' ')

            await resend.contacts.create({
              email: user.email,
              firstName: firstName!,
              lastName: lastName.join(' '),
              properties: {
                id: user.id,
              },
            })
          }
        },
      },
      update: {
        after: async user => {
          if (nodeEnv !== 'production' || !resend) {
            return
          }

          const [firstName, ...lastName] = user.name.split(' ')

          await resend.contacts.update({
            email: user.email,
            firstName: firstName!,
            lastName: lastName.join(' '),
            properties: {
              id: user.id,
            },
          })
        },
      },
    },
  },
  onAPIError: {
    onError: async error => {
      const text =
        typeof error === 'object' && error !== null
          ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
          : String(error)

      if (text.includes('Invalid email')) {
        return
      }

      if (env.ALERTS_EMAIL) {
        await sendEmail({
          to: env.ALERTS_EMAIL,
          subject: 'Alert from Better Auth',
          template: 'Alert',
          props: {
            text,
            service: 'Better Auth',
          },
        })
      } else {
        console.error('Alert from Better Auth', { text })
      }
    },
  },
  trustedOrigins: ['https://conar.app', 'https://*.conar.app', 'file://'],
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    crossSubDomainCookies: {
      enabled: true,
      domain: 'conar.app',
    },
    database: {
      generateId: 'uuid',
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema: {
      ...schema,
      api_keys: schema.apiKeys,
    },
  }) as ReturnType<typeof drizzleAdapter>,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user: { name, email }, url }) => {
      await sendEmail({
        to: email,
        subject: 'Reset your password',
        template: 'ResetPassword',
        props: {
          name: name || email,
          url,
        },
      })
    },
    onPasswordReset: async ({ user: { name, email } }) => {
      await sendEmail({
        to: email,
        subject: 'Your password has been reset',
        template: 'OnPasswordReset',
        props: {
          name: name || email,
        },
      })
    },
  },
  socialProviders: {
    google: {
      enabled: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
      prompt: 'select_account',
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      enabled: !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET,
      clientId: env.GITHUB_CLIENT_ID!,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
})
