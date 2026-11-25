import type { SubscriptionPlan } from '@tamery/shared/permissions'
import { sql } from 'drizzle-orm'
import { DrizzleQueryError } from 'drizzle-orm/errors'
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

// A call made while holding a database lock keeps the lock and a pool connection as long as it runs, so it gets far less than the client's 80 s and 2 retries.
export const STRIPE_UNDER_LOCK = { maxNetworkRetries: 1, timeout: 15_000 }

export const LOCK_TIMEOUT = sql`SET LOCAL lock_timeout = '5s'`

const LOCK_NOT_AVAILABLE = '55P03'

export const timedOutUnderLock = (error: unknown) =>
  error instanceof Stripe.errors.StripeConnectionError ||
  (error instanceof DrizzleQueryError &&
    error.cause !== undefined &&
    'code' in error.cause &&
    error.cause.code === LOCK_NOT_AVAILABLE)

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
