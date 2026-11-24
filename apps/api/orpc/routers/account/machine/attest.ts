import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { machineAttestationInput } from '@tamery/shared/machine'

import { redis } from '~/lib/redis'
import { accountMiddleware, orpc } from '~/orpc'

import { machineAttestation } from './attestation'

const limiter = new RedisRateLimiter(redis, {
  maxRequests: 30,
  prefix: 'machine-attest:',
  window: 60 * 1000,
})

export const attest = orpc
  .use(accountMiddleware)
  .use(ratelimit({ key: ({ context }) => context.user.id, limiter }))
  .input(machineAttestationInput)
  .handler(async ({ context, input }) => {
    await machineAttestation.set(input.nonce, input.origin, context.user.id)
  })
