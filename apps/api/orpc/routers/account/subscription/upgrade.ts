import { db } from '@tamery/db'
import { subscriptions, users } from '@tamery/db/schema'
import { PRO_TRIAL_DAYS } from '@tamery/shared/credits'
import { type } from 'arktype'
import { and, eq } from 'drizzle-orm'

import { getStripeCustomerId, stripe, stripePrices } from '~/lib/stripe'
import { getSubscription, tamerySubscriptions } from '~/lib/subscription'
import { accountMiddleware, orpc } from '~/orpc'

const DEFAULT_TEAM_SEATS = 2

export const upgrade = orpc
  .use(accountMiddleware)
  .input(
    type({
      cancelUrl: 'string',
      isYearly: 'boolean?',
      plan: '"pro" | "team" = "pro"',
      returnUrl: 'string',
      successUrl: 'string',
    })
  )
  .errors({
    CONFLICT: {
      message: 'You already have a plan. Change it in the billing portal.',
    },
    INTERNAL_SERVER_ERROR: { message: 'Stripe is not configured' },
  })
  .handler(({ context, errors, input }) => {
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
    return db.transaction(async (tx) => {
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

      const customerId = await getStripeCustomerId(client, context.user.id, tx)

      const open = await client.checkout.sessions.list({
        customer: customerId,
        status: 'open',
      })

      // An open AI credits checkout is the same customer's, in payment mode.
      await Promise.all(
        open.data
          .filter(({ mode }) => mode === 'subscription')
          .map(({ id }) => client.checkout.sessions.expire(id))
      )

      const session = await client.checkout.sessions.create({
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
      })

      if (!session.url) {
        throw errors.INTERNAL_SERVER_ERROR({
          message: 'Failed to create checkout session',
        })
      }

      return { url: session.url }
    })
  })
