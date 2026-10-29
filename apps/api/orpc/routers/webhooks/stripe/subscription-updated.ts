import { db } from '@tamery/db'
import { subscriptions } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'

export const subscriptionUpdated = async (event: Stripe.Event) => {
  if (event.type !== 'customer.subscription.updated') {
    return
  }

  const subscription = event.data.object

  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1)

  if (!existing) {
    throw new Error(`Subscription ${subscription.id} not found in database`)
  }

  const period =
    subscription.items.data[0]?.price.recurring?.interval === 'year'
      ? 'yearly'
      : 'monthly'
  const price = subscription.items.data[0]?.price.unit_amount
    ? subscription.items.data[0].price.unit_amount / 100
    : 0
  const periodStart = subscription.items.data[0]?.current_period_start
    ? new Date(subscription.items.data[0].current_period_start * 1000)
    : null
  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000)
    : null

  await db
    .update(subscriptions)
    .set({
      cancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      period,
      periodEnd,
      periodStart,
      price,
      status: subscription.status,
      stripePriceId: subscription.items.data[0]?.price.id ?? null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      trialStart: subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null,
    })
    .where(eq(subscriptions.id, existing.id))
}
