import { db } from '@tamery/db'
import type { SubscriptionStatus } from '@tamery/db/schema'
import { subscriptions, subscriptionSeats, users } from '@tamery/db/schema'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@tamery/shared/constants'
import type { SubscriptionPlan } from '@tamery/shared/permissions'
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { v7 } from 'uuid'

import { stripe, stripePrices } from './stripe'

// Conar's subscriptions share this table without a price id; they never grant Tamery's plan.
export const tamerySubscriptions = isNotNull(subscriptions.stripePriceId)

// The owner's seat has no `subscription_seats` row.
export const OWNER_SEATS = 1
const TRIAL_TEAM_SEATS = 2
const ENDED_STATUSES = new Set<SubscriptionStatus>([
  'canceled',
  'incomplete_expired',
])

/** Seats the owner may hand out: one during a trial whatever count it will bill, none once the Team ended or became Pro. */
export const getAssignableSeats = ({
  plan,
  seats,
  status,
}: {
  plan: SubscriptionPlan
  seats: number
  status: SubscriptionStatus | null
}) => {
  if (plan !== 'team' || !status || ENDED_STATUSES.has(status)) {
    return 0
  }

  return (
    (status === 'trialing' ? Math.min(seats, TRIAL_TEAM_SEATS) : seats) -
    OWNER_SEATS
  )
}

/** The user's own subscriptions first, then the active Teams that gave their verified email a seat. */
export const getSubscriptions = (userId: string) =>
  db
    .select()
    .from(subscriptions)
    .where(
      and(
        tamerySubscriptions,
        or(
          eq(subscriptions.userId, userId),
          and(
            eq(subscriptions.plan, 'team'),
            inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
            inArray(
              subscriptions.id,
              db
                .select({ id: subscriptionSeats.subscriptionId })
                .from(subscriptionSeats)
                .innerJoin(
                  users,
                  eq(users.normalizedEmail, subscriptionSeats.normalizedEmail)
                )
                // An unverified email would let anyone claim a seat meant for its owner.
                .where(and(eq(users.id, userId), eq(users.emailVerified, true)))
            )
          )
        )
      )
    )
    .orderBy(desc(eq(subscriptions.userId, userId)), desc(subscriptions.id))

export const getSubscription = async (userId: string) => {
  const userSubscriptions = await getSubscriptions(userId)

  return (
    userSubscriptions.find((s) =>
      ACTIVE_SUBSCRIPTION_STATUSES.includes(
        s.status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number]
      )
    ) ?? null
  )
}

const toDate = (seconds: number | null) =>
  seconds ? new Date(seconds * 1000) : null

/** The only writer of a Tamery subscription row and its seats: it stores what Stripe holds now, so a late, replayed or out-of-order event changes nothing. */
export const syncSubscription = (stripeSubscriptionId: string) =>
  db.transaction(async (tx) => {
    if (!stripe) {
      throw new Error('Stripe is not configured')
    }

    // Held across the Stripe read: two deliveries that read in one order and write in the other would store the older state.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${stripeSubscriptionId}))`
    )

    const subscription =
      await stripe.subscriptions.retrieve(stripeSubscriptionId)
    const [item] = subscription.items.data

    if (!item) {
      throw new Error(`Subscription ${subscription.id} has no items`)
    }

    const [existing] = await tx
      .select({ id: subscriptions.id, plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
      .limit(1)

    // A custom price from the Stripe dashboard names no plan, so the stored one stays.
    const plan = stripePrices.getPlan(item.price.id) ?? existing?.plan ?? 'pro'
    const values = {
      cancelAt: toDate(subscription.cancel_at),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      period:
        item.price.recurring?.interval === 'year'
          ? ('yearly' as const)
          : ('monthly' as const),
      periodEnd: toDate(item.current_period_end),
      periodStart: toDate(item.current_period_start),
      plan,
      price: (item.price.unit_amount ?? 0) / 100,
      seats: plan === 'team' ? (item.quantity ?? 1) : 1,
      status: subscription.status,
      stripePriceId: item.price.id,
      trialEnd: toDate(subscription.trial_end),
      trialStart: toDate(subscription.trial_start),
    }
    const id = existing?.id ?? v7()

    if (existing) {
      await tx.update(subscriptions).set(values).where(eq(subscriptions.id, id))
    } else {
      const { userId } = subscription.metadata

      if (!userId) {
        throw new Error('No userId found in subscription metadata')
      }

      await tx.insert(subscriptions).values({
        ...values,
        id,
        stripeSubscriptionId: subscription.id,
        userId,
      })
      await tx
        .update(users)
        .set({
          stripeCustomerId:
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id,
        })
        .where(and(eq(users.id, userId), isNull(users.stripeCustomerId)))
    }

    await tx
      .delete(subscriptionSeats)
      .where(
        inArray(
          subscriptionSeats.id,
          tx
            .select({ id: subscriptionSeats.id })
            .from(subscriptionSeats)
            .where(eq(subscriptionSeats.subscriptionId, id))
            .orderBy(subscriptionSeats.id)
            .offset(getAssignableSeats(values))
        )
      )
  })
