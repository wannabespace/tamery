import { SUBSCRIPTION_PAST_DUE_MESSAGE } from '@conar/shared/constants'
import { type } from 'arktype'

import { env } from '~/env'
import { getSubscription, optionalAuthMiddleware, orpc } from '~/orpc'

const bannerType = type({
  text: 'string',
  type: type.enumerated('info', 'warning', 'error', 'success'),
  dismissible: 'boolean',
}).array()

export const banner = orpc
  .use(optionalAuthMiddleware)
  .output(bannerType)
  .handler(async ({ context }) => {
    const subscription = context.user ? await getSubscription(context.user.id) : null

    const items: typeof bannerType.infer = []

    if (subscription?.status === 'past_due') {
      items.push({
        text: SUBSCRIPTION_PAST_DUE_MESSAGE,
        type: 'error',
        dismissible: false,
      })
    }

    if (env.BANNER_TEXT) {
      items.push({
        text: env.BANNER_TEXT,
        type: 'info',
        dismissible: false,
      })
    }

    if (context.isAppOutdated) {
      items.push({
        text: `You are using an outdated version of the desktop app. Please download the latest version from conar.app/download`,
        type: 'warning',
        dismissible: true,
      })
    }

    if (
      context.parsedAppVersion?.minor &&
      context.parsedAppVersion.minor === 25 &&
      context.os === 'linux'
    ) {
      items.push({
        text: 'Linux updates broken in 0.25.0 due to provider change. Please download the latest version from conar.app/download',
        type: 'warning',
        dismissible: true,
      })
    }

    items.push({
      text: 'Tamery is now open to everyone: get it at tamery.app/download. Conar will shut down by the end of the year.',
      type: 'info',
      dismissible: false,
    })

    return items
  })
