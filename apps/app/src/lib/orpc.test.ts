import { expect, mock, test } from 'bun:test'

import { PROXY_ERROR_MESSAGE } from '@tamery/shared/constants'

Object.assign(globalThis, { window: {} })
mock.module('~/utils/error', () => ({ handleError: () => null }))
mock.module('~/lib/auth', () => ({ bearerToken: { get: () => null } }))
mock.module('~/lib/urls', () => ({
  apiUrl: 'https://api.test',
  proxyUrl: 'https://proxy.test',
}))

const { orpcProxy } = await import('./orpc')

test('a gateway answering for a dead proxy reads as the proxy being unreachable', async () => {
  globalThis.fetch = Object.assign(
    () =>
      Promise.resolve(
        Response.json(
          {
            error: 'bad_gateway',
            message: 'The target app is not responding. It may have crashed.',
          },
          { status: 502 }
        )
      ),
    { preconnect: fetch.preconnect }
  )
  await expect(
    orpcProxy.query.postgres.transactionStatus({ txId: 'tx' })
  ).rejects.toThrow(PROXY_ERROR_MESSAGE)
})
