import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { querySerializer } from '@tamery/query-proxy/serializer'
import { bridgeKey } from '@tamery/shared/bridge'

import type { BridgeRouter } from './router'

const WEB_URL = 'https://app.tamery.test'
const USER_ID = 'user-1'
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tamery-bridge-'))
// The key file keeps the tests off the real keychain; HOME would not do, since the test runner fixes `os.homedir()`.
Object.assign(process.env, {
  API_URL: 'https://api.tamery.test',
  MAIN_URL: 'https://tamery.test',
  TAMERY_CONFIG_DIR: home,
  WEB_URL,
})
fs.writeFileSync(path.join(home, 'bridge.key'), 'test-key')

const ids = {
  full: '0190a1b2-0000-7000-8000-000000000001',
  gone: '0190a1b2-0000-7000-8000-000000000004',
  metadataOnly: '0190a1b2-0000-7000-8000-000000000002',
  noPassword: '0190a1b2-0000-7000-8000-000000000003',
}

const databaseFile = path.join(home, 'test.db')
const sqliteString = `sqlite://${databaseFile}`
fs.writeFileSync(databaseFile, '')

const modified = (connectionString: string, isPasswordExists = false) => ({
  connectionString,
  isPasswordExists,
  status: 'modified',
  updatedAt: new Date(),
})

const serverCopies: Record<string, unknown> = {
  [ids.full]: modified(sqliteString),
  [ids.gone]: { status: 'not-found' },
  [ids.metadataOnly]: { status: 'unchanged' },
  [ids.noPassword]: modified('postgresql://user:@db.internal:5432/app', true),
}
let apiDown = false

void mock.module('../api', () => ({
  account: {},
  api: {
    connections: {
      resolve: ({ id }: { id: string }) =>
        apiDown
          ? Promise.reject(new Error('fetch failed'))
          : Promise.resolve(serverCopies[id]),
    },
  },
}))

const { createRouter } = await import('./router')
const { serveBridge } = await import('./server')
const { pairings } = await import('./pairings')
const { vault } = await import('../vault')

const server = serveBridge({
  port: 0,
  publicUrl: new URL('https://db-box.tail1234.ts.net'),
  router: createRouter({ name: 'test-box', userId: USER_ID }),
})
const bridgeUrl = `http://127.0.0.1:${server.port}`

const createClient = (secret: string | null): BridgeRouter =>
  createORPCClient(
    new RPCLink({
      headers: {
        ...(secret && { authorization: `Bearer ${secret}` }),
        origin: WEB_URL,
      },
      origin: bridgeUrl,
      serializer: querySerializer,
      url: '/rpc',
    })
  )

const pair = () =>
  createClient(null).bridge.pair({
    code: pairings.issueCode(),
    label: 'Test browser',
    userId: USER_ID,
  })

const expectError = async (call: Promise<unknown>, code: string) => {
  const error = await call.then(
    () => null,
    (error_: unknown) => error_
  )
  expect(error).toMatchObject({ code, defined: true })
  return error
}

let paired: Awaited<ReturnType<typeof pair>>

beforeAll(async () => {
  paired = await pair()
  expect(paired.info).toMatchObject({ name: 'test-box' })
})

afterAll(async () => {
  await server.stop(true)
  fs.rmSync(home, { force: true, recursive: true })
})

describe('requests', () => {
  test('a host other than loopback or the public URL is refused', async () => {
    const response = await fetch(`${bridgeUrl}/rpc`, {
      headers: { host: 'evil.example' },
      method: 'POST',
    })
    expect(response.status).toBe(421)
  })

  test('an unknown origin is refused before anything runs', async () => {
    const response = await fetch(`${bridgeUrl}/rpc/bridge/hello`, {
      headers: { origin: 'https://evil.example' },
      method: 'POST',
    })
    expect(response.status).toBe(403)
  })

  test('a preflight from the app is answered without the secret', async () => {
    const response = await fetch(`${bridgeUrl}/rpc/bridge/hello`, {
      headers: { origin: WEB_URL },
      method: 'OPTIONS',
    })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(WEB_URL)
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'authorization'
    )
  })
})

describe('pairing', () => {
  test('a code pairs once', async () => {
    const code = pairings.issueCode()
    const input = { code, label: '', userId: USER_ID }
    await createClient(null).bridge.pair(input)
    await expectError(createClient(null).bridge.pair(input), 'INVALID_CODE')
  })

  test('a browser signed in to another account is refused and the code survives', async () => {
    const code = pairings.issueCode()
    await expectError(
      createClient(null).bridge.pair({ code, label: '', userId: 'someone' }),
      'OTHER_ACCOUNT'
    )
    expect(pairings.isCode(code)).toBe(true)
  })

  test('hello proves the bridge holds the browser key', async () => {
    const nonce = bridgeKey.nonce()
    const info = await createClient(null).bridge.hello({
      browserId: paired.browserId,
      nonce,
    })
    expect(info.proof).toBe(
      bridgeKey.proof(bridgeKey.hash(paired.secret), nonce)
    )
    const stranger = await createClient(null).bridge.hello({
      browserId: 'unknown',
      nonce,
    })
    expect(stranger.proof).toBeNull()
  })

  test('a call without a paired secret is refused', async () => {
    await expectError(
      createClient('not-a-secret').query.sqlite.execute({
        connectionId: ids.full,
        query: 'select 1',
      }),
      'UNAUTHORIZED'
    )
  })

  test('an unpaired browser is refused from then on', async () => {
    const { secret } = await pair()
    await createClient(secret).bridge.unpair()
    await expectError(
      createClient(secret).bridge.saveSecrets({
        connectionId: ids.full,
        connectionString: sqliteString,
      }),
      'UNAUTHORIZED'
    )
  })
})

describe('connections', () => {
  test('a Full connection runs from the server copy', async () => {
    const { result } = await createClient(paired.secret).query.sqlite.execute({
      connectionId: ids.full,
      query: 'select 1 as one',
    })
    expect(JSON.stringify(result)).toContain('one')
  })

  test('a Metadata only connection asks for everything, then runs from the saved copy', async () => {
    const client = createClient(paired.secret)
    const error = await expectError(
      client.query.sqlite.execute({
        connectionId: ids.metadataOnly,
        query: 'select 1',
      }),
      'NEEDS_SECRETS'
    )
    expect(error).toMatchObject({
      data: { connectionId: ids.metadataOnly, fields: 'all' },
    })
    await client.bridge.saveSecrets({
      connectionId: ids.metadataOnly,
      connectionString: sqliteString,
    })
    await client.query.sqlite.execute({
      connectionId: ids.metadataOnly,
      query: 'select 1',
    })
  })

  test('a No password connection asks for the password only', async () => {
    const error = await expectError(
      createClient(paired.secret).query.postgres.execute({
        connectionId: ids.noPassword,
        query: 'select 1',
      }),
      'NEEDS_SECRETS'
    )
    expect(error).toMatchObject({ data: { fields: ['password'] } })
  })

  test('saving one missing field keeps the secrets saved before', async () => {
    const client = createClient(paired.secret)
    await client.bridge.saveSecrets({
      connectionId: ids.noPassword,
      connectionString:
        'postgresql://user:secret@db.internal:5432/app?sslpassword=kept',
    })
    await client.bridge.saveSecrets({
      connectionId: ids.noPassword,
      connectionString:
        'postgresql://user:new@db.internal:5432/app?sslpassword=',
    })
    expect(await vault.connection(ids.noPassword)).toContain('sslpassword=kept')
  })

  test('with the API down, a resolved or locally saved connection still runs', async () => {
    apiDown = true
    try {
      const client = createClient(paired.secret)
      await client.query.sqlite.execute({
        connectionId: ids.full,
        query: 'select 1',
      })
      await client.query.sqlite.execute({
        connectionId: ids.metadataOnly,
        query: 'select 1',
      })
    } finally {
      apiDown = false
    }
  })

  test('a database error reaches the app with its message', async () => {
    const error = await createClient(paired.secret)
      .query.sqlite.execute({ connectionId: ids.full, query: 'select from' })
      .catch((error_: unknown) => error_)
    expect(error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: expect.stringContaining('syntax error'),
    })
  })

  test('a connection gone from the account is not found and its saved copy is deleted', async () => {
    await vault.setConnection(ids.gone, sqliteString)
    await expectError(
      createClient(paired.secret).query.sqlite.execute({
        connectionId: ids.gone,
        query: 'select 1',
      }),
      'NOT_FOUND'
    )
    expect(await vault.connection(ids.gone)).toBeNull()
  })

  test('a connection string is never run', async () => {
    const error = await createClient(paired.secret)
      // oxlint-disable-next-line ts/no-unsafe-argument -- an outdated app's input, which the contract no longer types
      .query.sqlite.execute({
        connectionString: sqliteString,
        query: 'select 1',
      } as never)
      .catch((error_: unknown) => error_)
    expect(error).toMatchObject({ code: 'BAD_REQUEST' })
  })
})
