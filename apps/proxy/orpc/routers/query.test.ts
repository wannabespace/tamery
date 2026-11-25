import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'

import { call, ORPCError } from '@orpc/server'
import { SESSION_NOT_FOUND_MESSAGE } from '@tamery/shared/constants'
import { noop } from '@tamery/shared/utils'

const resolve = mock(() =>
  Promise.resolve({
    connectionString: 'postgres://user:password@10.0.0.5/db',
    userId: 'user',
  })
)
mock.module('~/api-client', () => ({
  createApiClient: () => ({
    internal: { proxy: { resolveConnectionString: resolve } },
  }),
}))
mock.module('~/env', () => ({
  env: { API_URL: 'https://api.test' },
  nodeEnv: 'test',
}))
const { query } = await import('./query')

const context = {
  addLogData: noop,
  headers: new Headers(),
  request: new Request('https://proxy.tamery.test'),
  setHeader: noop,
  userAgent: null,
}

let getSession = spyOn(globalThis, 'fetch')
beforeEach(() => {
  resolve.mockClear()
  getSession = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(null))
})
afterEach(() => {
  getSession.mockRestore()
})

test('a string resolved by id costs one API call and is held to public hosts too', async () => {
  await expect(
    call(
      query.postgres.execute,
      { query: 'SELECT 1', resourceId: 'resource' },
      { context }
    )
  ).rejects.toThrow('only public hosts')
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(getSession).not.toHaveBeenCalled()
})

test('a session the API refuses stops a query by id', async () => {
  resolve.mockRejectedValueOnce(
    new ORPCError('UNAUTHORIZED', { message: SESSION_NOT_FOUND_MESSAGE })
  )
  await expect(
    call(
      query.postgres.execute,
      { connectionId: 'connection', query: 'SELECT 1' },
      { context }
    )
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})

test.each([
  ['no session', () => Response.json(null)],
  ['a revoked session', () => new Response(null, { status: 401 })],
])(
  'with %s, a raw string and a transaction are refused before they run',
  async (_name, answer) => {
    getSession.mockResolvedValueOnce(answer()).mockResolvedValueOnce(answer())
    await expect(
      call(
        query.postgres.execute,
        {
          connectionString: 'postgres://db.example.test/db',
          query: 'SELECT 1',
        },
        { context }
      )
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(
      call(query.postgres.transactionStatus, { txId: 'tx' }, { context })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(resolve).not.toHaveBeenCalled()
  }
)
