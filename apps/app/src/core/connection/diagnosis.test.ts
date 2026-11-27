import { beforeEach, expect, mock, test } from 'bun:test'

import { ORPCError } from '@orpc/client'
import { PROXY_ERROR_MESSAGE } from '@tamery/shared/constants'
import { noop } from '@tamery/shared/utils'
import { QueryObserver } from '@tanstack/react-query'

const capture = mock()
const network = { online: true }
const SECRET = 'hunter2'
const stored = {
  connectionString: `postgres://me:pw@db.acme.io/app?sslpassword=${SECRET}`,
}

mock.module('~/lib/posthog', () => ({ posthog: { capture } }))
mock.module('~/core/collections', () => ({
  getCollections: () => ({
    connectionStringsCollection: {
      utils: { decrypt: () => Promise.resolve(stored.connectionString) },
    },
  }),
}))
mock.module('~/store', () => ({ useIsOnline: () => network.online }))
Object.assign(globalThis, { window: {} })
Object.defineProperty(globalThis.navigator, 'onLine', {
  configurable: true,
  get: () => network.online,
})

const { diagnoseProxyFailure, diagnosisQueryOptions, reportConnectionFailure } =
  await import('./diagnosis')
const { failedAttempt } = await import('~/lib/failed-attempt')
const { queryClient } = await import('~/lib/query-client')

const SSL_REQUIRED = 'no pg_hba.conf entry for host "1.2.3.4", no encryption'

const diagnose = (error: Error) =>
  queryClient.fetchQuery(diagnosisQueryOptions('connection', error))

beforeEach(() => {
  network.online = true
  stored.connectionString = `postgres://me:pw@db.acme.io/app?sslpassword=${SECRET}`
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

test('counts each failed statement once, with no diagnosis read', () => {
  const first = new Error('connect ETIMEDOUT 34.1.2.3:5432')
  reportConnectionFailure(first, stored.connectionString)
  reportConnectionFailure(first, stored.connectionString)
  reportConnectionFailure(new Error(first.message), stored.connectionString)
  reportConnectionFailure(new Error('syntax error at or near "selec"'), '')
  reportConnectionFailure('a string', stored.connectionString)

  expect(capture).toHaveBeenCalledTimes(2)
  expect(capture.mock.calls[0]).toEqual([
    'connection_failed',
    { db_type: 'postgres', error_code: 'ETIMEDOUT', is_local: false },
  ])
})

test('labels a cloud proxy failure', () => {
  reportConnectionFailure(
    new Error(PROXY_ERROR_MESSAGE),
    stored.connectionString
  )

  expect(capture.mock.calls[0]?.[1]).toMatchObject({ error_code: 'proxy' })
})

test.each([
  ['a driver-derived title', 'database "hunter2" does not exist'],
  ['an SSH hint', 'SSH tunnel: SSH connection failed: bad key hunter2'],
])('caches %s without the secret it echoes', async (_, message) => {
  stored.connectionString = `postgres://me:${SECRET}@db.acme.io/app?ssh_host=b.acme.io&ssh_password=${SECRET}`
  const diagnosis = await diagnose(new Error(message))

  expect(diagnosis).not.toBeNull()
  expect(JSON.stringify(diagnosis)).not.toContain(SECRET)
})

test('diagnoses a failure whose words include the saved password', async () => {
  stored.connectionString = 'postgres://me:authentication@db.acme.io/app'
  const diagnosis = await diagnose(
    new Error('password authentication failed for user "me"')
  )

  expect(diagnosis?.title).toBe('Wrong user or password')
  expect(JSON.stringify(diagnosis)).not.toContain('authentication')
})

test("never shows another attempt's diagnosis while a new one loads", async () => {
  const previous = new Error(SSL_REQUIRED)
  await diagnose(previous)
  const observer = new QueryObserver(
    queryClient,
    diagnosisQueryOptions('connection', previous)
  )
  const unsubscribe = observer.subscribe(noop)
  observer.setOptions(
    diagnosisQueryOptions('connection', new Error(SSL_REQUIRED))
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

test('a rejection that is not an Error keeps its reason', async () => {
  await expect(
    queryClient.fetchQuery({
      // oxlint-disable-next-line eslint/prefer-promise-reject-errors -- the hooks must survive a reason that is not an Error
      queryFn: () => Promise.reject('x'),
      queryKey: ['primitive'],
    })
  ).rejects.toBe('x')
  await expect(
    queryClient
      .getMutationCache()
      // oxlint-disable-next-line eslint/prefer-promise-reject-errors -- as above
      .build(queryClient, { mutationFn: () => Promise.reject('y') })
      .execute(undefined)
  ).rejects.toBe('y')
})

test('titles a cloud proxy failure by the network it failed on', () => {
  network.online = false
  const error = new Error(PROXY_ERROR_MESSAGE)
  failedAttempt(error)

  expect(diagnoseProxyFailure(error, false)?.title).toBe("You're offline")
  expect(diagnoseProxyFailure(error, true)?.title).toBe(
    'This failed while you were offline'
  )
  network.online = true
  expect(diagnoseProxyFailure(new Error(PROXY_ERROR_MESSAGE), true)).toBeNull()
})
