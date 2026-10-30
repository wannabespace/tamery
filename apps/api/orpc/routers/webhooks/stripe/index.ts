import type Stripe from 'stripe'

import { env } from '~/env'
import { sendEmail } from '~/lib/resend'
import { orpc } from '~/orpc'

import { creditsPaid } from './credits-paid'
import { subscriptionCreated } from './subscription-created'
import { subscriptionDeleted } from './subscription-deleted'
import { subscriptionUpdated } from './subscription-updated'
import { validateRequest } from './validate'

const eventMap = new Map<
  Stripe.Event.Type,
  (event: Stripe.Event) => Promise<void>
>([
  ['customer.subscription.created', subscriptionCreated],
  ['customer.subscription.deleted', subscriptionDeleted],
  ['customer.subscription.updated', subscriptionUpdated],
  ['payment_intent.succeeded', creditsPaid],
])

const prices = new Set([env.STRIPE_MONTH_PRICE_ID, env.STRIPE_ANNUAL_PRICE_ID])

export const stripe = orpc
  .errors({
    BAD_REQUEST: { message: 'Stripe event not found' },
    INTERNAL_SERVER_ERROR: {},
  })
  .handler(async ({ context, errors }) => {
    try {
      const event = await validateRequest(context.request)

      const handler = eventMap.get(event.type)

      if (!handler) {
        throw errors.BAD_REQUEST()
      }

      const subscription = event.data.object

      if (
        subscription.object === 'subscription' &&
        !subscription.items.data.some((item) => prices.has(item.price.id))
      ) {
        return true
      }

      await handler(event).catch(async (error) => {
        if (env.ALERTS_EMAIL) {
          await sendEmail({
            props: {
              service: 'Stripe',
              text:
                typeof error === 'object' && error !== null
                  ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
                  : String(error),
            },
            subject: `Alert from Stripe: ${event.type}`,
            template: 'Alert',
            to: env.ALERTS_EMAIL,
          })
        }

        throw error
      })

      context.addLogData({
        stripeEvent: { id: event.id, type: event.type },
      })

      return true
    } catch (error) {
      throw errors.INTERNAL_SERVER_ERROR({
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })
