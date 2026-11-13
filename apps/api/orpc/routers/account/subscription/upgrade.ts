import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'

import { env } from '~/env'
import { stripe } from '~/lib/stripe'
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
    NOT_FOUND: { message: 'User not found' },
  })
  .handler(async ({ context, errors, input }) => {
    if (!stripe) {
      throw errors.INTERNAL_SERVER_ERROR()
    }

    const { successUrl, cancelUrl, isYearly } = input

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, context.user.id))
      .limit(1)

    if (!user) {
      throw errors.NOT_FOUND()
    }

    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id,
        },
        name: user.name,
      })
      customerId = customer.id

      await db
        .update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, user.id))
    }

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
        userId: user.id,
      },
      mode: 'subscription',
      subscription_data: {
        metadata: {
          userId: user.id,
        },
        trial_period_days: 7,
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
