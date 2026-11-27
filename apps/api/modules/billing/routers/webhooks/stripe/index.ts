import { db } from '@tamery/db'
import { subscriptions } from '@tamery/db/schema'
import { sanitizeLogData } from '@tamery/shared/sanitize-log'
import { and, eq } from 'drizzle-orm'
import type Stripe from 'stripe'

import { env } from '~/env'
import { sendEmail } from '~/lib/resend'
import { stripePrices } from '~/lib/stripe'
import {
  syncSubscription,
  tamerySubscriptions,
} from '~/modules/billing/subscription'
import { orpc } from '~/orpc'

import { CREDIT_PAYMENT_EVENTS, creditPayments } from './credit-payments'
import { validateRequest } from './validate'

const SUBSCRIPTION_EVENTS = new Set<Stripe.Event.Type>([
  'customer.subscription.created',
  'customer.subscription.deleted',
  'customer.subscription.updated',
])

// A subscription moved to a custom price in the Stripe dashboard is still ours once we track it.
const isTamerySubscription = async (subscription: Stripe.Subscription) => {
  if (
    subscription.items.data.some((item) => stripePrices.getPlan(item.price.id))
  ) {
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
    UNAUTHORIZED: { message: 'Invalid Stripe signature' },
  })
  .handler(async ({ context, errors }) => {
    const event = await validateRequest(context.request)

    if (!event) {
      throw errors.UNAUTHORIZED()
    }

    const { object } = event.data
    const subscription =
      SUBSCRIPTION_EVENTS.has(event.type) && object.object === 'subscription'
        ? object
        : null

    if (!(subscription || CREDIT_PAYMENT_EVENTS.has(event.type))) {
      throw errors.BAD_REQUEST()
    }

    try {
      if (subscription && !(await isTamerySubscription(subscription))) {
        return true
      }

      const handled: Promise<unknown> = subscription
        ? syncSubscription(subscription.id)
        : creditPayments(event)

      await handled.catch(async (error) => {
        if (env.ALERTS_EMAIL) {
          await sendEmail({
            props: {
              service: 'Stripe',
              text: JSON.stringify(sanitizeLogData(error), null, 2),
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
