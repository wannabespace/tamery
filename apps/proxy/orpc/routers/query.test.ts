import { expect, mock, test } from 'bun:test'

import { call, os } from '@orpc/server'
import { noop } from '@tamery/shared/utils'

const resolve = mock(() =>
  Promise.resolve('postgres://user:password@10.0.0.5/db')
)
mock.module('~/api-client', () => ({
  createApiClient: () => ({
    internal: { proxy: { resolveConnectionString: resolve } },
  }),
}))
const orpc = os.$context<{ headers: Headers }>()
mock.module('~/orpc', () => ({
  authMiddleware: orpc.middleware(({ next }) =>
    next({ context: { session: { userId: 'user' } } })
  ),
  orpc,
}))
const { query } = await import('./query')

test('a string resolved by id is held to public hosts too', async () => {
  await expect(
    call(
      query.postgres.execute,
      { query: 'SELECT 1', resourceId: 'resource' },
      {
        context: {
          addLogData: noop,
          headers: new Headers(),
          request: new Request('https://proxy.tamery.test'),
          setHeader: noop,
          userAgent: null,
        },
      }
    )
  ).rejects.toThrow('only public hosts')
  expect(resolve).toHaveBeenCalledTimes(1)
})
