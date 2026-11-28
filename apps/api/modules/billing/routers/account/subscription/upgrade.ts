import { db } from '@tamery/db'
import { subscriptions, users } from '@tamery/db/schema'
import { PRO_TRIAL_DAYS } from '@tamery/shared/credits'
import { type } from 'arktype'
import { Result } from 'better-result'
import { and, eq } from 'drizzle-orm'

import {
  getStripeCustomerId,
  LOCK_TIMEOUT,
  STRIPE_UNDER_LOCK,
  stripe,
  stripePrices,
  timedOutUnderLock,
} from '~/lib/stripe'
import { accountMiddleware, orpc } from '~/orpc'

import { getSubscription, tamerySubscriptions } from '../../../subscription'
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

      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, context.user.id))
        .for('update')

      const subscription = await getSubscription(context.user.id)

      if (subscription?.userId === context.user.id) {
        throw errors.CONFLICT()
      }

      const [previous] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(eq(subscriptions.userId, context.user.id), tamerySubscriptions)
        )
        .limit(1)

      const customerId = await getStripeCustomerId(
        client,
        context.user.id,
        tx,
        STRIPE_UNDER_LOCK
      )

      const open = await client.checkout.sessions.list(
        { customer: customerId, status: 'open' },
        STRIPE_UNDER_LOCK
      )

      // An open AI credits checkout is the same customer's, in payment mode.
      await Promise.all(
        open.data
          .filter(({ mode }) => mode === 'subscription')
          .map(({ id }) =>
            client.checkout.sessions.expire(id, {}, STRIPE_UNDER_LOCK)
          )
      )

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
