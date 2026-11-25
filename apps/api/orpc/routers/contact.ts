import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { CONTACT_EMAIL } from '@tamery/shared/constants'
import { type } from 'arktype'

import { redis } from '~/lib/redis'
import { resend } from '~/lib/resend'
import { ContactReceived } from '~/lib/resend/templates'
import { authMiddleware, orpc } from '~/orpc'

const limiter = new RedisRateLimiter(redis, {
  maxRequests: 5,
  prefix: 'contact:',
  window: 60 * 60 * 1000,
})

export const contact = orpc
  .use(authMiddleware)
  .use(ratelimit({ key: ({ context }) => context.user.id, limiter }))
  .input(
    type({
      message: '0 < string <= 4000',
    })
  )
  .handler(async ({ input, context }) => {
    if (!resend) {
      context.addLogData({ warning: 'Resend is not configured' })
      return
    }

    const { data, error } = await resend.batch.send([
      {
        from: `Tamery <${CONTACT_EMAIL}>`,
        html: `<p>From: ${Bun.escapeHTML(context.user.email)}</p><p>Message:<br>${Bun.escapeHTML(input.message).replaceAll('\n', '<br>')}</p>`,
        subject: `Contact request from ${context.user.email}`,
        to: CONTACT_EMAIL,
      },
      {
        from: `Tamery <${CONTACT_EMAIL}>`,
        react: ContactReceived({
          name: context.user.name || context.user.email,
        }),
        subject: "We've received your message",
        to: context.user.email,
      },
    ])

    if (error) {
      throw error
    }

    context.addLogData({
      emailData: data.data,
      emailSent: true,
    })
  })
