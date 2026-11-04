// This preload evaluates before the entry's own config import, so arktype first loads here.
import '@tamery/shared/arktype-config'
import { Buffer } from 'node:buffer'
import process from 'node:process'

import { type } from 'arktype'

const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-account/token'

const tokenResponse = type({ access_token: 'string' })
const decryptResponse = type({ plaintext: 'string' })

export class KmsConfigError extends Error {
  override name = 'KmsConfigError'
}

const fetchJson = async (url: string, init: RequestInit): Promise<unknown> => {
  const response = await fetch(url, init)

  if (!response.ok) {
    throw new Error(
      `${url} answered ${response.status}: ${await response.text()}`
    )
  }

  return response.json()
}

export const kms = {
  async unwrap(ciphertext: string) {
    // Reads process.env, not ./env: this runs inside the boot unwrap, before ./env can
    // load (./env asserts ENCRYPTION_SECRET, which is only in env once unwrap finishes).
    const { KMS_KEY_NAME: keyName } = process.env

    if (!keyName) {
      throw new KmsConfigError('Set KMS_KEY_NAME')
    }

    const { access_token: token } = tokenResponse.assert(
      await fetchJson(METADATA_TOKEN_URL, {
        headers: { 'Metadata-Flavor': 'Google' },
      })
    )
    const { plaintext } = decryptResponse.assert(
      await fetchJson(`https://cloudkms.googleapis.com/v1/${keyName}:decrypt`, {
        body: JSON.stringify({ ciphertext }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
    )

    return Buffer.from(plaintext, 'base64').toString('utf-8')
  },
}
