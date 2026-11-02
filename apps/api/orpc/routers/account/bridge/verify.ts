import { type } from 'arktype'

import { accountMiddleware, orpc } from '~/orpc'

import { bridgeAttestation } from './attestation'

export const verify = orpc
  .use(accountMiddleware)
  .input(type({ nonce: 'string.hex == 64' }))
  .handler(
    async ({ context, input }) =>
      (await bridgeAttestation.take(input.nonce)) === context.user.id
  )
