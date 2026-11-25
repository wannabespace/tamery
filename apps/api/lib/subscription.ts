import { db } from '@tamery/db'
import { subscriptions, subscriptionSeats, users } from '@tamery/db/schema'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '@tamery/shared/constants'
import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm'

// Conar's subscriptions share this table without a price id; they never grant Tamery's plan.
export const tamerySubscriptions = isNotNull(subscriptions.stripePriceId)

// The owner's seat has no `subscription_seats` row.
export const OWNER_SEATS = 1

/** The user's own subscriptions first, then the ones a team gave them a seat on. */
export const getSubscriptions = (userId: string) =>
  db
    .select()
    .from(subscriptions)
    .where(
      and(
        tamerySubscriptions,
        or(
          eq(subscriptions.userId, userId),
          inArray(
            subscriptions.id,
            db
              .select({ id: subscriptionSeats.subscriptionId })
              .from(subscriptionSeats)
              .innerJoin(users, eq(users.email, subscriptionSeats.email))
              // An unverified email would let anyone claim a seat meant for its owner.
              .where(and(eq(users.id, userId), eq(users.emailVerified, true)))
          )
        )
      )
    )
    .orderBy(desc(eq(subscriptions.userId, userId)))

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
