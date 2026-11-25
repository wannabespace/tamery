import { SUBSCRIPTION_PAST_DUE_MESSAGE } from '@tamery/shared/constants'
import { type } from 'arktype'

import { env } from '~/env'
import { getSubscription, optionalAuthMiddleware, orpc } from '~/orpc'

const bannerType = type({
  dismissible: 'boolean',
  text: 'string',
  type: type.enumerated('info', 'warning', 'error', 'success'),
}).array()

export const banner = orpc
  .use(optionalAuthMiddleware)
  .output(bannerType)
  .handler(async ({ context }) => {
    const subscription = context.user
      ? await getSubscription(context.user.id)
      : null

    const items: typeof bannerType.infer = []

    if (
      subscription?.status === 'past_due' &&
      subscription.userId === context.user?.id
    ) {
      items.push({
        dismissible: false,
        text: SUBSCRIPTION_PAST_DUE_MESSAGE,
        type: 'error',
      })
    }

    if (env.BANNER_TEXT) {
      items.push({
        dismissible: false,
        text: env.BANNER_TEXT,
        type: 'info',
      })
    }

    if (context.isAppOutdated) {
      items.push({
        dismissible: true,
        text: `You are using an outdated version of the desktop app. Please download the latest version from tamery.app/download`,
        type: 'warning',
      })
    }

    items.push({
      dismissible: true,
      text: 'Conar is now Tamery! New name, even better app - thanks for being part of the journey!',
      type: 'info',
    })

    return items
  })
