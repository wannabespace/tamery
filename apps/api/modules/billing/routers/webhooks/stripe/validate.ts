import type Stripe from 'stripe'

import { env } from '~/env'
import { stripe } from '~/lib/stripe'

/** `null` when the request is not signed by Stripe; throws when webhooks are not configured. */
export const validateRequest = async (
  request: Request
): Promise<Stripe.Event | null> => {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET

  if (!stripe || !webhookSecret) {
    throw new Error('Stripe webhooks are not configured')
  }

  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return null
  }

  return stripe.webhooks
    .constructEventAsync(await request.text(), signature, webhookSecret)
    .catch(() => null)
}
