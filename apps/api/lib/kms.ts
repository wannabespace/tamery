import { Buffer } from 'node:buffer'
import process from 'node:process'

import { InfisicalSDK } from '@infisical/sdk'
import { type } from 'arktype'

const configType = type({
  INFISICAL_CLIENT_ID: 'string',
  INFISICAL_CLIENT_SECRET: 'string',
  INFISICAL_KMS_KEY_ID: 'string',
  'INFISICAL_SITE_URL?': 'string',
})

let connection: Promise<{ keyId: string; sdk: InfisicalSDK }> | null = null

const login = async () => {
  try {
    const config = configType.assert(process.env)
    const sdk = new InfisicalSDK({ siteUrl: config.INFISICAL_SITE_URL })

    await sdk.auth().universalAuth.login({
      clientId: config.INFISICAL_CLIENT_ID,
      clientSecret: config.INFISICAL_CLIENT_SECRET,
    })

    return { keyId: config.INFISICAL_KMS_KEY_ID, sdk }
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
