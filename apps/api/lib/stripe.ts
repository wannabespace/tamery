import { db } from '@tamery/db'
import { users } from '@tamery/db/schema'
import { eq } from 'drizzle-orm'
import { Stripe } from 'stripe'

import { env } from '~/env'

export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-09-30.endive',
      appInfo: {
        name: 'Tamery',
        url: env.MAIN_URL,
      },
    })
  : null

/** The user's Stripe customer, created on their first checkout and kept on the user row. */
export const getStripeCustomerId = async (client: Stripe, userId: string) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
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
  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, user.id))
  return customer.id
}
