import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { bridgeAttestationInput } from '@tamery/shared/bridge'

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
  .input(bridgeAttestationInput)
  .handler(async ({ context, input }) => {
    await bridgeAttestation.set(input.nonce, input.origin, context.user.id)
  })
