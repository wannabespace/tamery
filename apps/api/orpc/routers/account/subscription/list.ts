import { pick } from '@tamery/shared/utils'

import { getAssignableSeats, getSubscriptions } from '~/lib/subscription'
import { authMiddleware, orpc } from '~/orpc'

export const list = orpc.use(authMiddleware).handler(async ({ context }) => {
  const subscriptions = await getSubscriptions(context.user.id)

  // A seat shows its holder the plan and nothing of the payer's billing.
  return subscriptions.map((subscription) =>
    subscription.userId === context.user.id
      ? {
          ...pick(subscription, [
            'cancelAt',
            'cancelAtPeriodEnd',
            'id',
            'period',
            'periodEnd',
            'periodStart',
            'plan',
            'price',
            'seats',
            'status',
            'trialEnd',
            'trialStart',
          ]),
          assignableSeats: getAssignableSeats(subscription),
          isOwner: true as const,
        }
      : {
          ...pick(subscription, ['plan', 'status']),
          isOwner: false as const,
        }
  )
})
