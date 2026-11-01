import { timingSafeEqual } from 'node:crypto'

import { env } from '~/env'
import { sendEmail } from '~/lib/resend'
import { orpc } from '~/orpc'

const secret = Buffer.from(env.RAILWAY_WEBHOOK_SECRET ?? '')

/** Railway signs nothing, so its webhook URL carries `?token=<RAILWAY_WEBHOOK_SECRET>`. */
export const railway = orpc
  .errors({ UNAUTHORIZED: {} })
  .handler(async ({ context, errors }) => {
    const token = Buffer.from(
      new URL(context.request.url).searchParams.get('token') ?? ''
    )

    if (
      secret.length === 0 ||
      token.length !== secret.length ||
      !timingSafeEqual(token, secret)
    ) {
      throw errors.UNAUTHORIZED()
    }

    if (!env.ALERTS_EMAIL) {
      context.addLogData({ warning: 'ALERTS_EMAIL is not set' })
      return
    }

    await sendEmail({
      props: {
        service: 'Railway',
        text: JSON.stringify(await context.request.json(), null, 2),
      },
      subject: 'Alert from Railway',
      template: 'Alert',
      to: env.ALERTS_EMAIL,
    })
  })
