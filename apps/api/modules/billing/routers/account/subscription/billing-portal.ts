import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'

import { env } from '~/env'
import { stripe } from '~/lib/stripe'
import { getSubscription } from '~/modules/billing/subscription'
import { authMiddleware, orpc } from '~/orpc'

import { billingDestination } from './billing-destination'

export const billingPortal = orpc
  .use(authMiddleware)
  .input(
    type({
      'changePlan?': 'boolean',
      returnUrl: billingDestination,
    })
  )
  .errors({
    INTERNAL_SERVER_ERROR: { message: 'Stripe is not configured' },
    NOT_FOUND: { message: 'No customer found' },
  })
  .handler(async ({ context, errors, input }) => {
    if (!stripe) {
      throw errors.INTERNAL_SERVER_ERROR()
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, context.user.id))
      .limit(1)

    if (!user?.stripeCustomerId) {
      throw errors.NOT_FOUND()
    }

    const subscription = input.changePlan
      ? await getSubscription(user.id)
      : null

    const portalSession = await stripe.billingPortal.sessions.create({
      // The account's default portal lists other products' prices too.
      ...(env.STRIPE_PORTAL_CONFIGURATION_ID && {
        configuration: env.STRIPE_PORTAL_CONFIGURATION_ID,
      }),
      customer: user.stripeCustomerId,
      return_url: input.returnUrl,
      ...(subscription?.userId === user.id &&
        subscription.stripeSubscriptionId && {
          flow_data: {
            subscription_update: {
              subscription: subscription.stripeSubscriptionId,
            },
            type: 'subscription_update',
          },
        }),
    })

    return { url: portalSession.url }
  })
