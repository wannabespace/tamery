import { topUpChargeCents } from '@tamery/shared/credits'
import type Stripe from 'stripe'

import { CREDITS_PAYMENT_KIND, credits } from '~/lib/credits'

/** The events the Stripe endpoint must send for AI credits; `apps/api/SECRETS.md` lists them for its setup. */
export const CREDIT_PAYMENT_EVENTS = new Set<Stripe.Event.Type>([
  'charge.dispute.created',
  'charge.refunded',
  'payment_intent.payment_failed',
  'payment_intent.succeeded',
])

const idOf = (value: string | { id: string } | null) =>
  typeof value === 'string' ? value : (value?.id ?? null)

const creditsIntent = (intent: Stripe.PaymentIntent) => {
  const { attemptId, kind, userId } = intent.metadata
  const amount = Number(intent.metadata.amount)
  if (kind !== CREDITS_PAYMENT_KIND) {
    return null
  }
  if (!(userId && amount > 0)) {
    throw new Error(`AI credits payment ${intent.id} has no user or amount`)
  }
  return { amount, attemptId: attemptId ?? null, userId }
}

/** Credits a paid top-up once, for what Stripe actually received; takes back what a refund or dispute returned. */
export const creditPayments = async (event: Stripe.Event) => {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object
      const topUp = creditsIntent(intent)
      if (!topUp) {
        return
      }
      if (
        intent.currency !== 'usd' ||
        intent.amount_received !== topUpChargeCents(topUp.amount)
      ) {
        throw new Error(
          `AI credits payment ${intent.id} received ${intent.amount_received} ${intent.currency}, not the charge for ${topUp.amount} credits`
        )
      }
      await credits.credit({
        ...topUp,
        paymentIntentId: intent.id,
        paymentMethodId: idOf(intent.payment_method),
      })
      break
    }
    case 'payment_intent.payment_failed': {
      const topUp = creditsIntent(event.data.object)
      if (topUp?.attemptId) {
        await credits.failAutoTopUp(topUp.userId, topUp.attemptId)
      }
      break
    }
    case 'charge.refunded': {
      const charge = event.data.object
      const paymentIntentId = idOf(charge.payment_intent)
      if (paymentIntentId) {
        await credits.reverse(
          paymentIntentId,
          charge.amount_refunded / charge.amount
        )
      }
      break
    }
    case 'charge.dispute.created': {
      const paymentIntentId = idOf(event.data.object.payment_intent)
      if (paymentIntentId) {
        await credits.reverse(paymentIntentId, 1)
      }
      break
    }
    default: {
      break
    }
  }
}
