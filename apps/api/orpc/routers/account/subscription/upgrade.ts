import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import { type } from 'arktype'
import { Result } from 'better-result'
import { eq } from 'drizzle-orm'

import {
  LOCK_TIMEOUT,
  STRIPE_UNDER_LOCK,
  stripe,
  stripePrices,
  timedOutUnderLock,
} from '~/lib/stripe'
import { getSubscription } from '~/lib/subscription'
import { accountMiddleware, orpc } from '~/orpc'

import { billingDestination } from './billing-destination'

const DEFAULT_TEAM_SEATS = 2

export const upgrade = orpc
  .use(accountMiddleware)
  .input(
    type({
      cancelUrl: billingDestination,
      isYearly: 'boolean?',
      plan: '"pro" | "team" = "pro"',
      returnUrl: 'string',
      successUrl: billingDestination,
    })
  )
  .errors({
    CONFLICT: {
      message: 'You already have a plan. Change it in the billing portal.',
    },
    GATEWAY_TIMEOUT: {
      message: 'Checkout took too long to open. Try again in a moment.',
    },
    INTERNAL_SERVER_ERROR: { message: 'Stripe is not configured' },
    NOT_FOUND: { message: 'User not found' },
  })
  .handler(async ({ context, errors, input }) => {
    const client = stripe

    if (!client) {
      throw errors.INTERNAL_SERVER_ERROR()
    }

    const { successUrl, cancelUrl, isYearly, plan } = input

    const priceId = stripePrices.getId(plan, isYearly ? 'yearly' : 'monthly')

    if (!priceId) {
      throw errors.INTERNAL_SERVER_ERROR({
        message: 'Stripe price is not configured',
      })
    }

    // Serializes a user's checkouts, so two tabs cannot each open one and pay for two plans.
    const checkout = db.transaction(async (tx) => {
      await tx.execute(LOCK_TIMEOUT)

      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, context.user.id))
        .limit(1)
        .for('update')

      if (!user) {
        throw errors.NOT_FOUND()
      }

      const subscription = await getSubscription(user.id)

      if (subscription?.userId === user.id) {
        throw errors.CONFLICT()
      }

      let customerId = user.stripeCustomerId

      if (customerId) {
        const open = await client.checkout.sessions.list(
          { customer: customerId, status: 'open' },
          STRIPE_UNDER_LOCK
        )

        await Promise.all(
          open.data.map((session) =>
            client.checkout.sessions.expire(session.id, {}, STRIPE_UNDER_LOCK)
          )
        )
      } else {
        const customer = await client.customers.create(
          {
            email: user.email,
            metadata: {
              userId: user.id,
            },
            name: user.name,
          },
          STRIPE_UNDER_LOCK
        )
        customerId = customer.id

        await tx
          .update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, user.id))
      }

      const session = await client.checkout.sessions.create(
        {
          cancel_url: cancelUrl,
          customer: customerId,
          line_items: [
            {
              price: priceId,
              ...(plan === 'team'
                ? {
                    adjustable_quantity: { enabled: true, minimum: 1 },
                    quantity: DEFAULT_TEAM_SEATS,
                  }
                : { quantity: 1 }),
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
        },
        STRIPE_UNDER_LOCK
      )

      if (!session.url) {
        throw errors.INTERNAL_SERVER_ERROR({
          message: 'Failed to create checkout session',
        })
      }

      return { url: session.url }
    })

    const result = await Result.tryPromise(() => checkout)

    if (result.isOk()) {
      return result.value
    }

    const { cause } = result.error

    throw timedOutUnderLock(cause) ? errors.GATEWAY_TIMEOUT() : cause
  })
