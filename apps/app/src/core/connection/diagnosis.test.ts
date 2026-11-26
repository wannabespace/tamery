import { beforeEach, expect, mock, test } from 'bun:test'

import { ORPCError } from '@orpc/client'
import { noop } from '@tamery/shared/utils'
import { QueryObserver } from '@tanstack/react-query'

const capture = mock()
const network = { online: true }

mock.module('~/lib/posthog', () => ({ posthog: { capture } }))
mock.module('~/core/collections', () => ({
  getCollections: () => ({}),
  useCollections: () => ({}),
}))
mock.module('~/store', () => ({ useIsOnline: () => network.online }))
Object.assign(globalThis, { window: {} })
Object.defineProperty(globalThis.navigator, 'onLine', {
  configurable: true,
  get: () => network.online,
})

const { diagnosisQueryOptions } = await import('./diagnosis')
const { failedAttempt } = await import('~/lib/failed-attempt')
const { queryClient } = await import('~/lib/query-client')

const SECRET = 'hunter2'
const decrypt = () =>
  Promise.resolve(`postgres://me:pw@db.acme.io/app?sslpassword=${SECRET}`)
const SSL_REQUIRED = 'no pg_hba.conf entry for host "1.2.3.4", no encryption'

const diagnose = (error: Error) =>
  queryClient.fetchQuery(diagnosisQueryOptions('connection', error, decrypt))

beforeEach(() => {
  network.online = true
  capture.mockClear()
  queryClient.clear()
})

test('caches only the title and hint, keyed by the attempt instead of its message', async () => {
  const error = new Error(SSL_REQUIRED)

  expect(await diagnose(error)).toEqual({
    hint: 'The server only accepts encrypted connections.',
    title: 'The server requires SSL',
  })
  const cached = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map(({ queryKey, state }) => [queryKey, state.data])
  )
  expect(cached).not.toContain(SECRET)
  expect(cached).not.toContain(error.message)
})

test('counts each failed attempt once, however often it is read', async () => {
  const first = new Error('connect ETIMEDOUT 34.1.2.3:5432')
  await diagnose(first)
  queryClient.clear()
  await diagnose(first)
  await diagnose(new Error(first.message))

  expect(capture).toHaveBeenCalledTimes(2)
  expect(capture.mock.calls[0]).toEqual([
    'connection_failed',
    { db_type: 'postgres', error_code: 'ETIMEDOUT', is_local: false },
  ])
})

test("never shows another attempt's diagnosis while a new one loads", async () => {
  const previous = new Error(SSL_REQUIRED)
  await diagnose(previous)
  const observer = new QueryObserver(
    queryClient,
    diagnosisQueryOptions('connection', previous, decrypt)
  )
  const unsubscribe = observer.subscribe(noop)
  observer.setOptions(
    diagnosisQueryOptions('connection', new Error(SSL_REQUIRED), decrypt)
  )

  expect(observer.getCurrentResult().data).toBeUndefined()
  unsubscribe()
})

test('keeps the network a query failed on', async () => {
  network.online = false
  const error = new Error('getaddrinfo ENOTFOUND db.acme.io')
  await queryClient
    .fetchQuery({ queryFn: () => Promise.reject(error), queryKey: ['failing'] })
    .catch(noop)
  network.online = true

  expect(failedAttempt(error).online).toBe(false)
  expect(await diagnose(error)).toMatchObject({ title: "You're offline" })
})

test('a failure the cloud proxy answered with never reads as offline', async () => {
  network.online = false

  expect(
    await diagnose(
      new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'getaddrinfo ENOTFOUND db.acme.io',
      })
    )
  ).toMatchObject({ title: 'Host not found' })
})
