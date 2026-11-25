import { pick } from '@tamery/shared/utils'

import { getSubscriptions } from '~/lib/subscription'
import { authMiddleware, orpc } from '~/orpc'

export const list = orpc.use(authMiddleware).handler(async ({ context }) => {
  const subscriptions = await getSubscriptions(context.user.id)

  return subscriptions.map((subscription) => ({
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
    isOwner: subscription.userId === context.user.id,
  }))
})
