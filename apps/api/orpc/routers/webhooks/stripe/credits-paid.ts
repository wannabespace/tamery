import type Stripe from 'stripe'

import { CREDITS_PAYMENT_KIND, credits } from '~/lib/credits'

export const creditsPaid = async (event: Stripe.Event) => {
  if (event.type !== 'payment_intent.succeeded') {
    return
  }
  const { id, metadata } = event.data.object
  if (metadata.kind !== CREDITS_PAYMENT_KIND) {
    return
  }
  const { userId } = metadata
  const amount = Number(metadata.amount)
  if (!(userId && amount > 0)) {
    throw new Error(`AI credits payment ${id} has no user or amount`)
  }
  await credits.credit({
    amount,
    automatic: metadata.automatic === 'true',
    paymentIntentId: id,
    userId,
  })
}
