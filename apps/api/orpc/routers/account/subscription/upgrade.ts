import { type } from 'arktype'

import { env } from '~/env'
import { getStripeCustomerId, stripe } from '~/lib/stripe'
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

    const customerId = await getStripeCustomerId(stripe, context.user.id)

    const priceId = isYearly
      ? env.STRIPE_ANNUAL_PRICE_ID
      : env.STRIPE_MONTH_PRICE_ID

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
