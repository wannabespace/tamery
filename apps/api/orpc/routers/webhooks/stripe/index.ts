import { db } from '@tamery/db'
import { subscriptions } from '@tamery/db/schema'
import { and, eq } from 'drizzle-orm'
import type Stripe from 'stripe'

import { env } from '~/env'
import { sendEmail } from '~/lib/resend'
import { tamerySubscriptions } from '~/lib/subscription'
import { orpc } from '~/orpc'

import { subscriptionCreated } from './subscription-created'
import { subscriptionDeleted } from './subscription-deleted'
import { subscriptionUpdated } from './subscription-updated'
import { validateRequest } from './validate'

const eventMap = new Map<
  Stripe.Event.Type,
  (event: Stripe.Event) => Promise<void>
>([
  ['customer.subscription.created', subscriptionCreated],
  ['customer.subscription.deleted', subscriptionDeleted],
  ['customer.subscription.updated', subscriptionUpdated],
])

const prices = new Set([env.STRIPE_MONTH_PRICE_ID, env.STRIPE_ANNUAL_PRICE_ID])

// A subscription moved to a custom price in the Stripe dashboard is still ours once we track it.
const isTamerySubscription = async (subscription: Stripe.Subscription) => {
  if (subscription.items.data.some((item) => prices.has(item.price.id))) {
    return true
  }

  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.stripeSubscriptionId, subscription.id),
        tamerySubscriptions
      )
    )
    .limit(1)

  return Boolean(existing)
}

export const stripe = orpc
  .errors({
    BAD_REQUEST: { message: 'Stripe event not found' },
    INTERNAL_SERVER_ERROR: {},
  })
  .handler(async ({ context, errors }) => {
    try {
      const event = await validateRequest(context.request)

      const handler = eventMap.get(event.type)

      if (!handler) {
        throw errors.BAD_REQUEST()
      }

      const subscription = event.data.object

      if (
        subscription.object === 'subscription' &&
        !(await isTamerySubscription(subscription))
      ) {
        return true
      }

      await handler(event).catch(async (error) => {
        if (env.ALERTS_EMAIL) {
          await sendEmail({
            props: {
              service: 'Stripe',
              text:
                typeof error === 'object' && error !== null
                  ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
                  : String(error),
            },
            subject: `Alert from Stripe: ${event.type}`,
            template: 'Alert',
            to: env.ALERTS_EMAIL,
          })
        }

        throw error
      })

      context.addLogData({
        stripeEvent: { id: event.id, type: event.type },
      })

      return true
    } catch (error) {
      throw errors.INTERNAL_SERVER_ERROR({
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })
