import { bridgeAttestationInput } from '@tamery/shared/bridge'

import { accountMiddleware, orpc } from '~/orpc'

import { bridgeAttestation } from './attestation'

export const verify = orpc
  .use(accountMiddleware)
  .input(bridgeAttestationInput)
  .handler(
    async ({ context, input }) =>
      (await bridgeAttestation.take(input.nonce, input.origin)) ===
      context.user.id
  )
