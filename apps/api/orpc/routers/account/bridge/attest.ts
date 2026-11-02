import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { type } from 'arktype'

import { redis } from '~/lib/redis'
import { accountMiddleware, orpc } from '~/orpc'

import { bridgeAttestation } from './attestation'

const limiter = new RedisRateLimiter(redis, {
  maxRequests: 30,
  prefix: 'bridge-attest:',
  window: 60 * 1000,
})

export const attest = orpc
  .use(accountMiddleware)
  .use(ratelimit({ key: ({ context }) => context.user.id, limiter }))
  .input(type({ nonce: 'string.hex == 64' }))
  .handler(async ({ context, input }) => {
    await bridgeAttestation.set(input.nonce, context.user.id)
  })
