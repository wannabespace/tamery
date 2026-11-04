import { Buffer } from 'node:buffer'
import process from 'node:process'

import { KeyManagementServiceClient } from '@google-cloud/kms'

export class KmsConfigError extends Error {
  override name = 'KmsConfigError'
}

const client = new KeyManagementServiceClient()

export const kms = {
  async unwrap(ciphertext: string) {
    // Reads process.env, not ./env: this runs inside the boot unwrap, before ./env can
    // load (./env asserts ENCRYPTION_SECRET, which is only in env once unwrap finishes).
    const { KMS_KEY_NAME: name } = process.env

    if (!name) {
      throw new KmsConfigError('Set KMS_KEY_NAME')
    }

    const [{ plaintext }] = await client.decrypt({
      ciphertext: Buffer.from(ciphertext, 'base64'),
      name,
    })

    return Buffer.from(plaintext as Uint8Array).toString('utf-8')
  },
}
