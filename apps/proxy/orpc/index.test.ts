import { expect, mock, test } from 'bun:test'

import { ORPCError } from '@orpc/client'
import { call } from '@orpc/server'
import { ORIGINS } from '@tamery/shared/origins'

const viewer = mock(() => Promise.resolve({ id: 'owner' }))
mock.module('~/api-client', () => ({
  createApiClient: () => ({ account: { viewer } }),
}))
mock.module('~/env', () => ({ nodeEnv: 'test' }))
const { authMiddleware, orpc } = await import('./index')
const whoami = orpc
  .use(authMiddleware)
  .handler(({ context }) => context.session.userId)

const contextWith = (headers: HeadersInit = {}) => ({
  addLogData: mock(),
  headers: new Headers(headers),
  request: new Request('https://proxy.test/rpc'),
  setHeader: mock(),
  userAgent: null,
})

test('proxy auth answers UNAUTHORIZED only when the API does', async () => {
  const context = contextWith()
  expect(await call(whoami, undefined, { context })).toBe('owner')

  viewer.mockRejectedValueOnce(new ORPCError('UNAUTHORIZED'))
  await expect(call(whoami, undefined, { context })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  })

  viewer.mockRejectedValueOnce(new ORPCError('TOO_MANY_REQUESTS'))
  await expect(call(whoami, undefined, { context })).rejects.not.toMatchObject({
    code: 'UNAUTHORIZED',
  })
})

test('proxy auth refuses a session cookie sent from any origin but the web app', async () => {
  await Promise.all(
    [ORIGINS.share, 'https://docs.tamery.app'].map((origin) =>
      expect(
        call(whoami, undefined, {
          context: contextWith({ cookie: 'session=1', origin }),
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    )
  )
  expect(
    await call(whoami, undefined, {
      context: contextWith({ cookie: 'session=1', origin: ORIGINS.web }),
    })
  ).toBe('owner')
})
