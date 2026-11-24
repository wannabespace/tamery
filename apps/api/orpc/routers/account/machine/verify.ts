import { machineAttestationInput } from '@tamery/shared/machine'

import { accountMiddleware, orpc } from '~/orpc'

import { machineAttestation } from './attestation'

export const verify = orpc
  .use(accountMiddleware)
  .input(machineAttestationInput)
  .handler(
    async ({ context, input }) =>
      (await machineAttestation.take(input.nonce, input.origin)) ===
      context.user.id
  )
