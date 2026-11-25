import type { SubscriptionPlan } from '@tamery/shared/permissions'
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
