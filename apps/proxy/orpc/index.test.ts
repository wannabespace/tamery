import { expect, mock, spyOn, test } from 'bun:test'

import { call } from '@orpc/server'
import { ORIGINS } from '@tamery/shared/origins'

mock.module('~/env', () => ({
  env: { API_URL: 'https://api.test' },
  nodeEnv: 'test',
}))
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

test('proxy auth reads the user ID from the nested Better Auth session', async () => {
  const fetchSession = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      session: { userId: 'owner' },
      user: { id: 'owner' },
    })
  )
  const context = contextWith()
  try {
    expect(await call(whoami, undefined, { context })).toBe('owner')
    fetchSession.mockResolvedValueOnce(Response.json(null))
    await expect(call(whoami, undefined, { context })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  } finally {
    fetchSession.mockRestore()
  }
})

test('proxy auth refuses a session cookie sent from any origin but the web app', async () => {
  const fetchSession = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ session: { userId: 'owner' } })
  )
  try {
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
  } finally {
    fetchSession.mockRestore()
  }
})
