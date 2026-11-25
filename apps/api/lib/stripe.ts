import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import type { SubscriptionPlan } from '@tamery/shared/permissions'
import { eq } from 'drizzle-orm'
import { Stripe } from 'stripe'

import { env } from '~/env'

export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-11-18.endive',
      appInfo: {
        name: 'Tamery',
        url: env.MAIN_URL,
      },
    })
  : null

/** The user's Stripe customer, created on their first checkout and kept on the user row. A caller that locked the row passes its transaction. */
export const getStripeCustomerId = async (
  client: Stripe,
  userId: string,
  tx: Pick<typeof db, 'select' | 'update'> = db
) => {
  const [user] = await tx.select().from(users).where(eq(users.id, userId))
  if (!user) {
    throw new Error(`User ${userId} not found`)
  }
  if (user.stripeCustomerId) {
    return user.stripeCustomerId
  }
  const customer = await client.customers.create({
    email: user.email,
    metadata: { userId: user.id },
    name: user.name,
  })
  await tx
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, user.id))
  return customer.id
}

const PRICE_IDS = {
  pro: {
    monthly: env.STRIPE_PRO_MONTH_PRICE_ID,
    yearly: env.STRIPE_PRO_ANNUAL_PRICE_ID,
  },
  team: {
    monthly: env.STRIPE_TEAM_MONTH_PRICE_ID,
    yearly: env.STRIPE_TEAM_ANNUAL_PRICE_ID,
  },
}

export const stripePrices = {
  getId: (plan: SubscriptionPlan, period: 'monthly' | 'yearly') =>
    PRICE_IDS[plan][period] ?? null,
  getPlan: (priceId: string): SubscriptionPlan | null =>
    (['pro', 'team'] as const).find((plan) =>
      Object.values(PRICE_IDS[plan]).includes(priceId)
    ) ?? null,
}
