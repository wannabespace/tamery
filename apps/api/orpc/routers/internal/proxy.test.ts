import { beforeEach, expect, mock, test } from 'bun:test'
import process from 'node:process'

import { call, os } from '@orpc/server'
import { SyncType } from '@tamery/shared/enums/sync-type'

import type { Context } from '../../context'

const storedDefaults = () => ({
  connectionString: 'postgres://user:p@ss@host/default?sslmode=require',
  isPasswordExists: false,
  syncType: SyncType.Cloud,
})
let stored = storedDefaults()
beforeEach(() => {
  stored = storedDefaults()
})

const connection = () => ({
  connectionString: 'encrypted',
  isPasswordExists: stored.isPasswordExists,
  syncType: stored.syncType,
  workspaceId: 'workspace',
})
mock.module('@tamery/db', () => ({
  db: {
    query: {
      connections: { findFirst: () => Promise.resolve(connection()) },
      connectionsResources: {
        findFirst: () =>
          Promise.resolve({ connection: connection(), name: 'other database' }),
      },
    },
  },
}))
Object.assign(process.env, {
  DATABASE_URL: 'postgres://test@127.0.0.1:1/test',
  ENCRYPTION_SECRET: 'test-encryption-secret-of-32-chars',
  USER_KEY_SECRET: 'test-user-key-secret-of-32-chars',
})
mock.module('~/env', () => ({ env: { PROXY_SHARED_SECRET: 'secret' } }))
const orpc = os.$context<Context>()
mock.module('~/orpc', () => ({
  authMiddleware: orpc.middleware(({ next }) =>
    next({
      context: {
        decryptConnectionString: () => Promise.resolve(stored.connectionString),
        user: { id: 'user' },
      },
    })
  ),
  orpc,
}))
const { proxy } = await import('./proxy')

const BY_RESOURCE = { resourceId: 'resource' }

const resolve = (
  input:
    | { resourceId: string }
    | { connectionId: string; withUserId?: true } = BY_RESOURCE
) =>
  call(proxy.resolveConnectionString, input, {
    context: {
      addLogData: mock(),
      clientId: undefined,
      headers: new Headers({ 'x-proxy-token': 'secret' }),
      isAppOutdated: false,
      isDesktop: false,
      parsedAppVersion: null,
      request: new Request('https://api.test/rpc'),
      setHeader: mock(),
      userAgent: null,
    },
  })

test('resource resolution selects the resource database and preserves credentials and SSL', async () => {
  expect(await resolve()).toBe(
    'postgres://user:p@ss@host/other%20database?sslmode=require'
  )
})

test('connection resolution returns the stored string unchanged', async () => {
  expect(await resolve({ connectionId: 'connection' })).toBe(
    stored.connectionString
  )
})

test('a proxy that asks for the user gets it beside the string', async () => {
  expect(
    await resolve({ connectionId: 'connection', withUserId: true })
  ).toEqual({ connectionString: stored.connectionString, userId: 'user' })
})

test('refuses a connection synced without secrets whose password was stripped', async () => {
  stored.syncType = SyncType.CloudWithoutSecrets
  stored.isPasswordExists = true

  await expect(resolve()).rejects.toThrow('secrets or connection string')
})

test('refuses a connection synced without secrets whose SSL passphrase was stripped', async () => {
  stored.syncType = SyncType.CloudWithoutSecrets
  stored.connectionString =
    'mysql://user@host/default?sslkey=key&sslpassphrase='

  await expect(resolve()).rejects.toThrow('secrets or connection string')
})
