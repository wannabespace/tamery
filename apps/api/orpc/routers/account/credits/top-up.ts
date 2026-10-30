import { CREDIT_TOP_UP } from '@tamery/shared/credits'
import { type } from 'arktype'

import { CREDITS_PAYMENT_KIND } from '~/lib/credits'
import { getStripeCustomerId, stripe } from '~/lib/stripe'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const topUp = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.chat.use'))
  .input(
    type({
      amount: type.number
        .divisibleBy(1)
        .atLeast(CREDIT_TOP_UP.min)
        .atMost(CREDIT_TOP_UP.max),
      cancelUrl: 'string',
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
    const metadata = {
      amount: String(input.amount),
      automatic: 'false',
      kind: CREDITS_PAYMENT_KIND,
      userId: context.user.id,
    }
    const session = await stripe.checkout.sessions.create({
      cancel_url: input.cancelUrl,
      customer: await getStripeCustomerId(stripe, context.user.id),
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Tamery AI credits' },
            unit_amount: input.amount * 100,
          },
          quantity: 1,
        },
      ],
      metadata,
      mode: 'payment',
      // Saves the card for auto top-up, which charges it off session.
      payment_intent_data: { metadata, setup_future_usage: 'off_session' },
      success_url: input.successUrl,
    })
    if (!session.url) {
      throw errors.INTERNAL_SERVER_ERROR({
        message: 'Failed to create checkout session',
      })
    }
    return { url: session.url }
  })
