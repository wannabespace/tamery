import { db } from '@tamery/db'
import { subscriptions, subscriptionSeats } from '@tamery/db/schema'
import { eq, inArray } from 'drizzle-orm'
import type Stripe from 'stripe'

import { OWNER_SEATS } from '~/lib/subscription'

import { getPlanAndSeats } from './plan'

export const subscriptionUpdated = async (event: Stripe.Event) => {
  if (event.type !== 'customer.subscription.updated') {
    return
  }

  const subscription = event.data.object

  const [existing] = await db
    .select({ id: subscriptions.id, plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1)

  if (!existing) {
    throw new Error(`Subscription ${subscription.id} not found in database`)
  }

  const [item] = subscription.items.data

  if (!item) {
    throw new Error(`Subscription ${subscription.id} has no items`)
  }

  const { plan, seats } = getPlanAndSeats(item, existing.plan)
  const period =
    item.price.recurring?.interval === 'year' ? 'yearly' : 'monthly'
  const price = item.price.unit_amount ? item.price.unit_amount / 100 : 0
  const periodStart = item.current_period_start
    ? new Date(item.current_period_start * 1000)
    : null
  const periodEnd = item.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null

  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({
        cancelAt: subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000)
          : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        period,
        periodEnd,
        periodStart,
        plan,
        price,
        seats,
        status: subscription.status,
        stripePriceId: item.price.id,
        trialEnd: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
        trialStart: subscription.trial_start
          ? new Date(subscription.trial_start * 1000)
          : null,
      })
      .where(eq(subscriptions.id, existing.id))

    await tx.delete(subscriptionSeats).where(
      inArray(
        subscriptionSeats.id,
        tx
          .select({ id: subscriptionSeats.id })
          .from(subscriptionSeats)
          .where(eq(subscriptionSeats.subscriptionId, existing.id))
          .orderBy(subscriptionSeats.id)
          .offset(seats - OWNER_SEATS)
      )
    )
  })
}
