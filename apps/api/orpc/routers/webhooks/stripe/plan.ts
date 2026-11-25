import type { SubscriptionPlan } from '@tamery/shared/permissions'
import type Stripe from 'stripe'

import { stripePrices } from '~/lib/stripe'

/** A custom price from the Stripe dashboard names no plan, so `currentPlan` stays. */
export const getPlanAndSeats = (
  item: Stripe.SubscriptionItem,
  currentPlan: SubscriptionPlan | null
) => {
  const plan = stripePrices.getPlan(item.price.id) ?? currentPlan ?? 'pro'

  return { plan, seats: plan === 'team' ? item.quantity || 1 : 1 }
}
