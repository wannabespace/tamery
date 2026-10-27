import { Buffer } from 'node:buffer'
import process from 'node:process'

import { InfisicalSDK } from '@infisical/sdk'

let connection: Promise<{ keyId: string; sdk: InfisicalSDK }> | null = null

const login = async () => {
  try {
    // Reads process.env, not ./env: this runs inside the boot unwrap, before ./env can
    // load (./env asserts ENCRYPTION_SECRET, which is only in env once unwrap finishes).
    const {
      INFISICAL_CLIENT_ID: clientId,
      INFISICAL_CLIENT_SECRET: clientSecret,
      INFISICAL_KMS_KEY_ID: keyId,
      INFISICAL_SITE_URL: siteUrl,
    } = process.env

    if (!(clientId && clientSecret && keyId)) {
      throw new Error(
        'Set INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET and INFISICAL_KMS_KEY_ID'
      )
    }

    const sdk = new InfisicalSDK({ siteUrl })

    await sdk.auth().universalAuth.login({ clientId, clientSecret })

    return { keyId, sdk }
  } catch (error) {
    connection = null
    throw error
  }
}

const connect = () => {
  connection ??= login()
  return connection
}

export const kms = {
  async unwrap(ciphertext: string) {
    const { keyId, sdk } = await connect()
    const plaintext = await sdk
      .kms()
      .encryption()
      .decrypt({ ciphertext, keyId })

    return Buffer.from(plaintext, 'base64').toString('utf-8')
  },
  async wrap(secret: string) {
    const { keyId, sdk } = await connect()

    return sdk
      .kms()
      .encryption()
      .encrypt({
        keyId,
        plaintext: Buffer.from(secret, 'utf-8').toString('base64'),
      })
  },
}
