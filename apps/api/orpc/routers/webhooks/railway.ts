import { env } from '~/env'
import { sendEmail } from '~/lib/resend'
import { safeEqual } from '~/lib/safe-equal'
import { orpc } from '~/orpc'

/** Railway signs nothing, so the webhook sends `Authorization: Bearer <RAILWAY_WEBHOOK_SECRET>` as a custom header. */
export const railway = orpc
  .errors({ UNAUTHORIZED: {} })
  .handler(async ({ context, errors }) => {
    if (
      !env.RAILWAY_WEBHOOK_SECRET ||
      !safeEqual(
        context.headers.get('authorization') ?? '',
        `Bearer ${env.RAILWAY_WEBHOOK_SECRET}`
      )
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
