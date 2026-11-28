import { beforeEach, expect, mock, test } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'
import { SyncType } from '@tamery/shared/enums/sync-type'
import { machineIdSchema } from '@tamery/shared/machine'
import { sql } from 'kysely'
import { clearMemoizeCache, getCacheStore } from 'memoza'

import type { MachineRoute } from '../machine/pairing'

const machineCall = () =>
  mock((_input: object) => Promise.resolve({ duration: 0, result: [] }))
const machine = {
  beginTransaction: mock(() => Promise.resolve({ txId: 'tx' })),
  execute: machineCall(),
  executeTransaction: machineCall(),
}
const cloud = { execute: machineCall(), executeTransaction: machineCall() }
const pairing = {
  browserId: 'browser',
  machineId: machineIdSchema.assert('machine'),
  name: 'valerii-mbp',
  secret: 'secret',
  url: 'http://127.0.0.1:26380',
}
const state: { inCloud: boolean; route: MachineRoute | null } = {
  inCloud: false,
  route: null,
}

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
mock.module('~/core/connection/diagnosis', () => ({
  reportConnectionFailure: () => {},
}))
mock.module('~/core/runtime/machine/machine', () => ({
  machine: { client: () => ({ query: { postgres: machine } }) },
}))
mock.module('~/core/runtime/machine/pairing', () => ({
  CLOUD: 'cloud',
  THIS_COMPUTER: 'this-computer',
  defaultRunsOn: () => (window.electron ? 'this-computer' : 'cloud'),
  getConnectionRunsOn: () =>
    state.inCloud
      ? 'cloud'
      : (state.route?.machineId ??
        (window.electron ? 'this-computer' : 'cloud')),
  getMachineRouteById: (runsOn: string) =>
    state.route?.machineId === runsOn ? state.route : null,
}))
Object.assign(globalThis, { window: {} })

const { fetchingConfig } = await import('~/core/connection/fetching-config')
const { createDialectProvider } = await import('./driver')
const { dialects } = await import('./index')

const paired: MachineRoute = {
  asks: null,
  machineId: pairing.machineId,
  name: pairing.name,
  pairing,
}
const select = { query: 'SELECT 1', values: [] }

beforeEach(() => {
  state.inCloud = false
  state.route = null
  for (const call of [...Object.values(machine), ...Object.values(cloud)]) {
    call.mockClear()
  }
})

test('a paired browser sends the machine ids, never a connection string', async () => {
  state.route = paired
  const connectionString = 'postgres://user@localhost/shop'
  await createDialectProvider(Dialect.Postgres, {
    connectionString,
    resourceId: 'resource',
  }).execute(select)
  await createDialectProvider(Dialect.Postgres, {
    connectionId: 'connection',
    connectionString,
  }).execute(select)

  expect(machine.execute.mock.calls.map(([input]) => input)).toEqual([
    { connectionId: 'connection', resourceName: 'shop', ...select },
    { connectionId: 'connection', resourceName: null, ...select },
  ])
  expect(cloud.execute).not.toHaveBeenCalled()
})

test('the form tests no string on a machine, which runs saved connections only', () => {
  expect(
    fetchingConfig(null, {
      connectionString: null,
      draft: true,
      machine: paired,
      runsOn: paired.machineId,
    }).reason
  ).toStartWith('Saved connections run on valerii-mbp')
})

test('a connection the machine asked secrets for waits for them instead of falling back to the cloud', () => {
  state.route = { ...paired, asks: ['password'] }
  expect(() =>
    createDialectProvider(Dialect.Postgres, {
      connectionString: 'postgres://user@db.example.com/shop',
      resourceId: 'resource',
    }).execute(select)
  ).toThrow('Enter the password')
  expect(machine.execute).not.toHaveBeenCalled()
  expect(cloud.execute).not.toHaveBeenCalled()
})

test('a transaction stays on the machine that opened it', async () => {
  state.route = paired
  const provider = createDialectProvider(Dialect.Postgres, {
    connectionString: 'postgres://user@localhost/shop',
    resourceId: 'resource',
  })
  const { txId } = await provider.beginTransaction({})
  state.route = null
  await provider.executeTransaction({ txId, ...select })
  expect(machine.executeTransaction).toHaveBeenCalledTimes(1)
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

const sshString =
  'postgres://user:password@db.internal/db?ssh_host=bastion&ssh_auth=key&ssh_key=secret'

test('an SSH connection runs on the machine by id, its string never sent', async () => {
  state.route = paired
  await createDialectProvider(Dialect.Postgres, {
    connectionString: sshString,
    resourceId: 'resource',
  }).execute(select)
  expect(machine.execute).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(machine.execute.mock.calls)).not.toContain('ssh_key')
  expect(cloud.execute).not.toHaveBeenCalled()
})

test('without a machine, the web app never sends an SSH connection string anywhere', () => {
  expect(() =>
    createDialectProvider(Dialect.Postgres, {
      connectionString: sshString,
      resourceId: 'resource',
    }).execute(select)
  ).toThrow('SSH tunnels run in the Tamery desktop app or through')
  expect(machine.execute).not.toHaveBeenCalled()
  expect(cloud.execute).not.toHaveBeenCalled()
})

const publicString = 'postgres://user:password@db.example.com/shop'
const onDesktop = async (run: () => Promise<unknown>) => {
  const execute = machineCall()
  Object.assign(window, { electron: { query: { postgres: { execute } } } })
  try {
    await run()
  } finally {
    Reflect.deleteProperty(window, 'electron')
  }
  return execute
}

const testOnDesktop = (runsOn: 'cloud' | 'this-computer') =>
  onDesktop(() =>
    createDialectProvider(Dialect.Postgres, {
      connectionString: publicString,
      runsOn,
    }).execute(select)
  )

test('on desktop a string under test runs in the cloud only when Runs on says so', async () => {
  expect(await testOnDesktop('this-computer')).toHaveBeenCalledTimes(1)
  expect(cloud.execute).not.toHaveBeenCalled()
  expect(await testOnDesktop('cloud')).not.toHaveBeenCalled()
  expect(cloud.execute).toHaveBeenCalledTimes(1)
})

test('on desktop a connection the cloud cannot reach fails there instead of running on this computer', async () => {
  state.inCloud = true
  const execute = await onDesktop(async () => {
    expect(() =>
      createDialectProvider(Dialect.Postgres, {
        connectionId: 'connection',
        connectionString: publicString,
      }).execute(select)
    ).toThrow('Tamery Cloud cannot reach this connection')
    await Promise.resolve()
  })
  expect(execute).not.toHaveBeenCalled()
  expect(cloud.execute).not.toHaveBeenCalled()
})

test('a run pinned to where it started keeps going there after Runs on changes', async () => {
  state.route = paired
  const pinned = (runsOn: 'this-computer' | typeof paired.machineId) =>
    createDialectProvider(Dialect.Postgres, {
      connectionString: publicString,
      resourceId: 'resource',
      runsOn,
    }).execute(select)

  state.inCloud = true
  await pinned(paired.machineId)
  state.inCloud = false
  const electron = await onDesktop(() => pinned('this-computer'))

  expect(machine.execute).toHaveBeenCalledTimes(1)
  expect(electron).toHaveBeenCalledTimes(1)
  expect(cloud.execute).not.toHaveBeenCalled()
})
