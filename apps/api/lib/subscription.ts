import { db } from '@tamery/db'
import type { SubscriptionStatus } from '@tamery/db/schema'
import { subscriptions, subscriptionSeats, users } from '@tamery/db/schema'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@tamery/shared/constants'
import { Result } from 'better-result'
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { v7 } from 'uuid'

import {
  LOCK_TIMEOUT,
  STRIPE_UNDER_LOCK,
  stripe,
  stripePrices,
  timedOutUnderLock,
} from './stripe'

// Conar's subscriptions share this table without a price id; they never grant Tamery's plan.
export const tamerySubscriptions = isNotNull(subscriptions.stripePriceId)

// The owner's seat has no `subscription_seats` row.
export const OWNER_SEATS = 1
const TRIAL_TEAM_SEATS = 2
const ENDED_STATUSES = new Set<SubscriptionStatus>([
  'canceled',
  'incomplete_expired',
])

type SeatPlan = Pick<
  typeof subscriptions.$inferSelect,
  'plan' | 'seats' | 'status'
>

const getSeatCapacity = ({ plan, seats, status }: SeatPlan) => {
  if (plan !== 'team' || !status || ENDED_STATUSES.has(status)) {
    return 0
  }

  return (
    (status === 'trialing' ? Math.min(seats, TRIAL_TEAM_SEATS) : seats) -
    OWNER_SEATS
  )
}

export const getAssignableSeats = (subscription: SeatPlan) =>
  subscription.status === 'active' || subscription.status === 'trialing'
    ? getSeatCapacity(subscription)
    : 0

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
            // ARRAY() runs the seat lookup once, so both sides of the OR use an index; `IN (subquery)` becomes a hashed subplan that scans every subscription on each request.
            sql`${subscriptions.id} = ANY(ARRAY(${db
              .select({ id: subscriptionSeats.subscriptionId })
              .from(subscriptionSeats)
              .innerJoin(
                users,
                eq(users.normalizedEmail, subscriptionSeats.normalizedEmail)
              )
              // An unverified email would let anyone claim a seat meant for its owner.
              .where(
                and(eq(users.id, userId), eq(users.emailVerified, true))
              )}))`
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

const storeSubscription = (stripeSubscriptionId: string) =>
  db.transaction(async (tx) => {
    if (!stripe) {
      throw new Error('Stripe is not configured')
    }

    await tx.execute(LOCK_TIMEOUT)

    // Held across the Stripe read: two deliveries that read in one order and write in the other would store the older state.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${stripeSubscriptionId}))`
    )

    const subscription = await stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      {},
      STRIPE_UNDER_LOCK
    )
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

      // Deleting the account deleted its row, and Stripe keeps sending events until the subscription ends.
      const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for('key share')

      if (!owner) {
        // A checkout finished or a renewal after the deletion would keep billing an account that no longer exists.
        if (
          !ENDED_STATUSES.has(subscription.status) &&
          !subscription.cancel_at_period_end &&
          !subscription.cancel_at
        ) {
          await stripe.subscriptions.cancel(
            subscription.id,
            {},
            STRIPE_UNDER_LOCK
          )
        }

        return
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
            .offset(getSeatCapacity(values))
        )
      )
  })

/** The only writer of a Tamery subscription row and its seats: it stores what Stripe holds now, so a late, replayed or out-of-order event changes nothing. */
export const syncSubscription = async (stripeSubscriptionId: string) => {
  const result = await Result.tryPromise(() =>
    storeSubscription(stripeSubscriptionId)
  )

  if (result.isOk()) {
    return
  }

  const { cause } = result.error

  throw timedOutUnderLock(cause)
    ? new Error(
        `Timed out waiting for Stripe or another sync of ${stripeSubscriptionId}; Stripe retries the event`,
        { cause }
      )
    : cause
}
