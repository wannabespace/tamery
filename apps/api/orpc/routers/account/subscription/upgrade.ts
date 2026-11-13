import { db } from '@tamery/db'
import { subscriptions } from '@tamery/db/schema'
import { PRO_TRIAL_DAYS } from '@tamery/shared/credits'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { env } from '~/env'
import { getStripeCustomerId, stripe } from '~/lib/stripe'
import { tamerySubscriptions } from '~/lib/subscription'
import { accountMiddleware, orpc } from '~/orpc'

export const upgrade = orpc
  .use(accountMiddleware)
  .input(
    type({
      cancelUrl: 'string',
      isYearly: 'boolean?',
      returnUrl: 'string',
      successUrl: 'string',
    })
  )
  .errors({
    INTERNAL_SERVER_ERROR: { message: 'Stripe is not configured' },
  })
  .handler(async ({ context, errors, input }) => {
    if (!stripe) {
      throw errors.INTERNAL_SERVER_ERROR()
    }

    const { successUrl, cancelUrl, isYearly } = input

    const [customerId, [previous]] = await Promise.all([
      getStripeCustomerId(stripe, context.user.id),
      db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(eq(subscriptions.userId, context.user.id), tamerySubscriptions)
        )
        .limit(1),
    ])

    const priceId = isYearly
      ? env.STRIPE_PRO_ANNUAL_PRICE_ID
      : env.STRIPE_PRO_MONTH_PRICE_ID

    if (!priceId) {
      throw errors.INTERNAL_SERVER_ERROR({
        message: 'Stripe price is not configured',
      })
    }

    const session = await stripe.checkout.sessions.create({
      cancel_url: cancelUrl,
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: context.user.id,
      },
      mode: 'subscription',
      subscription_data: {
        metadata: {
          userId: context.user.id,
        },
        ...(!previous && { trial_period_days: PRO_TRIAL_DAYS }),
      },
      success_url: successUrl,
    })

    if (!session.url) {
      throw errors.INTERNAL_SERVER_ERROR({
        message: 'Failed to create checkout session',
      })
    }

    return { url: session.url }
  })
