import { beforeEach, expect, mock, test } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { sql } from 'kysely'
import { clearMemoizeCache, getCacheStore } from 'memoza'

import type { BridgeRoute } from '../bridge/pairing'

const bridgeCall = () =>
  mock((_input: object) => Promise.resolve({ duration: 0, result: [] }))
const bridge = {
  beginTransaction: mock(() => Promise.resolve({ txId: 'tx' })),
  execute: bridgeCall(),
  executeTransaction: bridgeCall(),
}
const cloud = { execute: bridgeCall(), executeTransaction: bridgeCall() }
const pairing = {
  browserId: 'browser',
  name: 'valerii-mbp',
  secret: 'secret',
  url: 'http://127.0.0.1:26380',
}
const state: { route: BridgeRoute | null } = { route: null }

mock.module('~/core/collections', () => ({
  getCollections: () => ({
    connectionsCollection: new Map([
      [
        'connection',
        { isPasswordExists: true, syncType: SyncType.CloudWithoutSecrets },
      ],
    ]),
    connectionsResourcesCollection: new Map([
      ['resource', { connectionId: 'connection', name: 'shop' }],
    ]),
  }),
}))
mock.module('~/lib/orpc', () => ({
  orpcProxy: { query: { postgres: cloud } },
}))
mock.module('~/core/runtime/bridge/bridge', () => ({
  bridge: { client: () => ({ query: { postgres: bridge } }) },
}))
mock.module('~/core/runtime/bridge/pairing', () => ({
  bridgePairing: { get: () => (state.route ? pairing : null) },
  getBridgeRoute: () => state.route,
}))
Object.assign(globalThis, { window: {} })

const { createDialectProvider } = await import('./driver')
const { dialects } = await import('./index')

const paired: BridgeRoute = { asks: null, name: pairing.name }
const select = { query: 'SELECT 1', values: [] }

beforeEach(() => {
  state.route = null
  for (const call of [...Object.values(bridge), ...Object.values(cloud)]) {
    call.mockClear()
  }
})

test('a paired browser sends the bridge ids, never a connection string', async () => {
  state.route = paired
  // No password: this device lacks the password, which the bridge holds.
  const connectionString = 'postgres://user@localhost/shop'
  await createDialectProvider(Dialect.Postgres, {
    connectionString,
    resourceId: 'resource',
  }).execute(select)
  await createDialectProvider(Dialect.Postgres, {
    connectionId: 'connection',
    connectionString,
  }).execute(select)

  expect(bridge.execute.mock.calls.map(([input]) => input)).toEqual([
    { connectionId: 'connection', resourceName: 'shop', ...select },
    { connectionId: 'connection', resourceName: null, ...select },
  ])
  expect(cloud.execute).not.toHaveBeenCalled()
})

test('a paired browser sends a string under test nowhere', () => {
  state.route = paired
  expect(() =>
    createDialectProvider(Dialect.Postgres, {
      connectionString: 'postgres://user:password@db.example.com/shop',
    }).execute(select)
  ).toThrow('Saved connections run on valerii-mbp')
  expect(bridge.execute).not.toHaveBeenCalled()
  expect(cloud.execute).not.toHaveBeenCalled()
})

test('a connection the bridge asked secrets for waits for them instead of falling back to the cloud', () => {
  state.route = { ...paired, asks: ['password'] }
  expect(() =>
    createDialectProvider(Dialect.Postgres, {
      connectionString: 'postgres://user@db.example.com/shop',
      resourceId: 'resource',
    }).execute(select)
  ).toThrow('Enter the password')
  expect(bridge.execute).not.toHaveBeenCalled()
  expect(cloud.execute).not.toHaveBeenCalled()
})

test('a transaction stays on the bridge that opened it', async () => {
  state.route = paired
  const provider = createDialectProvider(Dialect.Postgres, {
    connectionString: 'postgres://user@localhost/shop',
    resourceId: 'resource',
  })
  const { txId } = await provider.beginTransaction({})
  state.route = null
  await provider.executeTransaction({ txId, ...select })
  expect(bridge.executeTransaction).toHaveBeenCalledTimes(1)
  expect(cloud.executeTransaction).not.toHaveBeenCalled()
})

test('dialect caches reuse equal inputs with fresh log callbacks', async () => {
  for (const factory of Object.values(dialects)) {
    clearMemoizeCache(factory)
    const options = {
      connectionString: 'postgres://user:password@localhost/db',
    }
    const first = factory({ ...options, log: mock() })
    const second = factory({ ...options, log: mock() })
    expect(second).toBe(first)
    expect(getCacheStore(factory)?.cache.size).toBe(1)
    clearMemoizeCache(factory)
  }
  state.route = paired
  const log = mock()
  const db = dialects.postgres({
    connectionString: 'postgres://user:password@localhost/db',
    log,
    resourceId: 'resource',
  })
  await sql`SELECT 1`.execute(db)
  expect(log).toHaveBeenCalledTimes(1)
})

test('the web app never sends an SSH connection string anywhere', () => {
  state.route = paired
  expect(() =>
    createDialectProvider(Dialect.Postgres, {
      connectionString:
        'postgres://user:password@db.internal/db?ssh_host=bastion&ssh_auth=key&ssh_key=secret',
      resourceId: 'resource',
    }).execute(select)
  ).toThrow('SSH tunnels run in the Tamery desktop app')
  expect(bridge.execute).not.toHaveBeenCalled()
  expect(cloud.execute).not.toHaveBeenCalled()
})
