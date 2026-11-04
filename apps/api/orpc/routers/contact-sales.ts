import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { CONTACT_EMAIL } from '@tamery/shared/constants'
import { type } from 'arktype'

import { redis } from '~/lib/redis'
import { resend } from '~/lib/resend'
import { optionalAuthMiddleware, orpc } from '~/orpc'

const limiter = new RedisRateLimiter(redis, {
  maxRequests: 5,
  prefix: 'contact-sales:',
  window: 60 * 60 * 1000,
})

// Unauthenticated: only ever mail CONTACT_EMAIL, never the submitted address, or it becomes a relay.
export const contactSales = orpc
  .use(optionalAuthMiddleware)
  .use(
    ratelimit({
      // Only X-Real-IP is set by Cloudflare's transform rule, and origins accept only Cloudflare; any other client-IP header can be spoofed.
      key: ({ context }) => context.headers.get('x-real-ip') ?? 'unknown',
      limiter,
    })
  )
  .input(
    type({
      email: 'string.email <= 254',
      message: '0 < string <= 4000',
    })
  )
  .handler(async ({ input, context }) => {
    if (!resend) {
      context.addLogData({ warning: 'Resend is not configured' })
      return
    }

    const { error } = await resend.emails.send({
      from: `Tamery <${CONTACT_EMAIL}>`,
      html: `<p>From: ${Bun.escapeHTML(input.email)}</p><p>${Bun.escapeHTML(input.message).replaceAll('\n', '<br>')}</p>`,
      replyTo: input.email,
      subject: `Enterprise request from ${input.email}`,
      to: CONTACT_EMAIL,
    })

    if (error) {
      throw error
    }
  })
