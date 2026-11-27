import { expect, mock, test } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

mock.module('~/core/collections', () => ({ getCollections: () => ({}) }))
mock.module('./dialects', () => ({
  dialects: new Proxy({}, { get: () => () => ({}) }),
}))

const { createQuery } = await import('./query')

const failOnce = () => {
  const run = mock()
    .mockRejectedValueOnce(new Error('fetch failed'))
    .mockResolvedValue(1)
  return { query: new Proxy({}, { get: () => run }) as never, run }
}

const params = {
  connectionString: 'libsql://db.acme.io',
  dialect: Dialect.SQLite,
}

test('retries a read that failed with a bare fetch failure', async () => {
  const { query, run } = failOnce()

  expect(await createQuery({ query, type: type('number') }).run(params)).toBe(1)
  expect(run).toHaveBeenCalledTimes(2)
})

test('never retries a write that failed with a bare fetch failure', async () => {
  const { query, run } = failOnce()

  await expect(createQuery({ query }).run(params)).rejects.toThrow(
    'fetch failed'
  )
  expect(run).toHaveBeenCalledTimes(1)
})
