import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { db } from '@tamery/db'
import { passkeys, users } from '@tamery/db/schema'
import { CLIENT_IP_HEADER } from '@tamery/shared/constants'
import { type } from 'arktype'
import { eq } from 'drizzle-orm'

import { redis } from '~/lib/redis'
import { orpc } from '~/orpc'

const limiter = new RedisRateLimiter(redis, {
  maxRequests: 20,
  prefix: 'has-passkey:',
  window: 60 * 60 * 1000,
})

// Unauthenticated: an account without a passkey must answer the same as no account, or this reveals who has signed up.
export const hasPasskey = orpc
  .use(
    ratelimit({
      key: ({ context }) => context.headers.get(CLIENT_IP_HEADER) ?? 'unknown',
      limiter,
    })
  )
  .input(type({ email: 'string.email <= 254' }))
  .handler(async ({ input }) => {
    const [passkey] = await db
      .select({ id: passkeys.id })
      .from(passkeys)
      .innerJoin(users, eq(passkeys.userId, users.id))
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1)

    return !!passkey
  })
