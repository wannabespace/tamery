import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { confineSqliteFiles } from '@tamery/connection/queries/dialects/sqlite/client'
import { querySerializer } from '@tamery/query-proxy/serializer'
import { bridgeKey } from '@tamery/shared/bridge'
import { challenge } from '@tamery/shared/challenge'
import { encrypt } from '@tamery/shared/crypto-node'
import { sleep } from '@tamery/shared/utils'

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
  certificate: '0190a1b2-0000-7000-8000-000000000006',
  tunnel: '0190a1b2-0000-7000-8000-000000000008',
  full: '0190a1b2-0000-7000-8000-000000000001',
  gone: '0190a1b2-0000-7000-8000-000000000004',
  machineLogin: '0190a1b2-0000-7000-8000-000000000005',
  proxied: '0190a1b2-0000-7000-8000-00000000000a',
  metadataOnly: '0190a1b2-0000-7000-8000-000000000002',
  noPassword: '0190a1b2-0000-7000-8000-000000000003',
  socketless: '0190a1b2-0000-7000-8000-000000000009',
  unresolved: '0190a1b2-0000-7000-8000-000000000007',
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

const certificateString =
  'postgresql://user:secret@db.internal:5432/app?sslkey=/home/me/.ssh/id_rsa'
const tunnelString =
  'postgresql://user:secret@db.internal:5432/app?ssh_host=bastion.example.com&ssh_user=deploy&ssh_auth=agent'
const machineLoginString =
  'mongodb://db.example.com/app?authMechanism=MONGODB-AWS'

const serverCopies: Record<string, unknown> = {
  [ids.certificate]: modified(certificateString),
  [ids.tunnel]: modified(tunnelString),
  [ids.full]: modified(sqliteString),
  [ids.gone]: { status: 'not-found' },
  [ids.machineLogin]: modified(machineLoginString),
  [ids.metadataOnly]: { status: 'no-connection-string' },
  [ids.proxied]: modified(`${machineLoginString}&proxyHost=evil.example`),
  [ids.noPassword]: modified('postgresql://user:@db.internal:5432/app', true),
  [ids.socketless]: modified(`postgresql://${databaseFile}`),
  [ids.unresolved]: { status: 'no-connection-string' },
}
let apiDown = false
let signedOut = false
let attestDown = false
const attested: string[] = []
/** `origin nonce` pairs the user's own browser had Tamery vouch for. */
const browserNonces = new Set<string>()

interface Attestation {
  nonce: string
  origin: string
}

void mock.module('../api', () => ({
  account: {},
  api: {
    account: {
      bridge: {
        attest: ({ nonce, origin }: Attestation) => {
          if (attestDown) {
            return Promise.reject(new Error('fetch failed'))
          }
          attested.push(`${origin} ${nonce}`)
          return Promise.resolve()
        },
        verify: ({ nonce, origin }: Attestation) => {
          if (attestDown) {
            return Promise.reject(new Error('fetch failed'))
          }
          return Promise.resolve(browserNonces.delete(`${origin} ${nonce}`))
        },
      },
    },
    connections: {
      resolve: ({ id }: { id: string }) => {
        if (signedOut) {
          return Promise.reject(new ORPCError('UNAUTHORIZED'))
        }
        return apiDown
          ? Promise.reject(new Error('fetch failed'))
          : Promise.resolve(serverCopies[id])
      },
    },
  },
}))

const { createRouter } = await import('./router')
const { serveBridge } = await import('./server')
const { pairings } = await import('./pairings')
const { approvals } = await import('./approvals')
const { vault } = await import('../vault')
const { configFiles } = await import('../config-files')

confineSqliteFiles()

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

/** Plays the person at the terminal: answers the next request to arrive and returns it. */
const answer = async (allowed: boolean) => {
  while (approvals.waiting().length === 0) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- waiting for the request to arrive
    await sleep(10)
  }
  const [request] = approvals.waiting()
  approvals.decide(request?.id ?? '', allowed)
  return request
}

/** The browser attests `browserNonce` for the URL it calls, `attestedFor`, which a relay would name instead of the bridge's. */
const requestAccess = (
  overrides: {
    attestedFor?: string
    browserNonce?: string
    label?: string
    nonce?: string
    userId?: string
  } = {}
) => {
  const {
    attestedFor = bridgeUrl,
    browserNonce = bridgeKey.nonce(),
    ...input
  } = overrides
  browserNonces.add(`${attestedFor} ${browserNonce}`)
  return createClient(null).bridge.pair({
    browserNonce,
    label: 'Test browser',
    nonce: bridgeKey.nonce(),
    userId: USER_ID,
    ...input,
  })
}

const pair = async () => {
  const [pairing] = await Promise.all([requestAccess(), answer(true)])
  return pairing
}

/** Saves a string that asks for a file, tunnel or machine login, which the person at the terminal must allow. */
const saveAllowed = async (
  client: BridgeRouter,
  input: Parameters<BridgeRouter['bridge']['saveSecrets']>[0]
) => {
  await Promise.all([client.bridge.saveSecrets(input), answer(true)])
}

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
  test('a browser allowed at the terminal is paired, its nonce attested to Tamery for the URL it called', async () => {
    const nonce = bridgeKey.nonce()
    const [pairing] = await Promise.all([
      requestAccess({ nonce }),
      answer(true),
    ])
    expect(attested).toContain(`${bridgeUrl} ${nonce}`)
    expect(pairings.find(pairing.browserId)?.hash).toBe(
      bridgeKey.hash(pairing.secret)
    )
  })

  test('a request relayed from another URL is refused before anyone is asked', async () => {
    await expectError(
      requestAccess({ attestedFor: 'https://relay.example' }),
      'OTHER_ACCOUNT'
    )
    await expectError(
      requestAccess({ attestedFor: 'http://127.0.0.1:9999' }),
      'OTHER_ACCOUNT'
    )
    expect(approvals.waiting()).toHaveLength(0)
  })

  test('the first answer stands when the terminal and `tamery bridge approve` both answer', async () => {
    const asked = requestAccess()
    const request = await answer(false)
    approvals.decide(request?.id ?? '', true)
    await expectError(asked, 'DECLINED')
  })

  test('a declined browser gets nothing', async () => {
    const before = pairings.labels().length
    await Promise.all([expectError(requestAccess(), 'DECLINED'), answer(false)])
    expect(pairings.labels().length).toBe(before)
  })

  test('a label cannot write control characters into the terminal prompt', async () => {
    const [, request] = await Promise.all([
      requestAccess({ label: 'Chrome\u001B[2K\rYour MacBook' }),
      answer(true),
    ])
    expect(request?.question).toContain('Chrome[2KYour MacBook')
    expect(request?.question).not.toContain('\r')
  })

  test('the terminal shows the code of the browser asking, so the user can match it', async () => {
    const browserNonce = bridgeKey.nonce()
    const [, request] = await Promise.all([
      requestAccess({ browserNonce }),
      answer(true),
    ])
    expect(request?.question).toContain(challenge.getUserCode(browserNonce))
  })

  test('a browser signed in to another account is refused before anyone is asked', async () => {
    await expectError(requestAccess({ userId: 'someone' }), 'OTHER_ACCOUNT')
    expect(approvals.waiting()).toHaveLength(0)
  })

  test('a request Tamery cannot attest is refused before anyone is asked', async () => {
    attestDown = true
    try {
      await expectError(requestAccess(), 'NOT_ATTESTED')
    } finally {
      attestDown = false
    }
    expect(approvals.waiting()).toHaveLength(0)
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

  test('unpairing from another process reaches the running bridge', async () => {
    const { browserId, secret } = await pair()
    configFiles.remove(path.join(configFiles.browsers, `${browserId}.json`))
    await expectError(createClient(secret).bridge.unpair(), 'UNAUTHORIZED')
    const saved = path.join(home, 'browsers-before-reset')
    fs.cpSync(configFiles.browsers, saved, { recursive: true })
    pairings.reset()
    try {
      await expectError(
        createClient(paired.secret).bridge.unpair(),
        'UNAUTHORIZED'
      )
    } finally {
      fs.cpSync(saved, configFiles.browsers, { recursive: true })
    }
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
  test('a synced SQLite file runs only once its path is saved on the bridge', async () => {
    const client = createClient(paired.secret)
    const run = () =>
      client.query.sqlite.execute({
        connectionId: ids.full,
        query: 'select 1 as one',
      })
    await expectError(run(), 'UNCONFIRMED')
    await saveAllowed(client, {
      connectionId: ids.full,
      connectionString: `sqlite://${path.join(home, 'other.db')}`,
    })
    await expectError(run(), 'UNCONFIRMED')
    await saveAllowed(client, {
      connectionId: ids.full,
      connectionString: sqliteString,
    })
    const { result } = await run()
    expect(JSON.stringify(result)).toContain('one')
  })

  test('a synced certificate file or machine login is refused until saved on the bridge', async () => {
    const client = createClient(paired.secret)
    await expectError(
      client.query.postgres.execute({
        connectionId: ids.certificate,
        query: 'select 1',
      }),
      'UNCONFIRMED'
    )
    await expectError(
      client.query.mongodb.execute({
        connectionId: ids.machineLogin,
        query: 'db.users.find()',
      }),
      'UNCONFIRMED'
    )
    await saveAllowed(client, {
      connectionId: ids.machineLogin,
      connectionString:
        'mongodb://elsewhere.example.com/app?authMechanism=MONGODB-AWS',
    })
    await expectError(
      client.query.mongodb.execute({
        connectionId: ids.machineLogin,
        query: 'db.users.find()',
      }),
      'UNCONFIRMED'
    )
  })

  test('a machine login routed through a proxy the bridge was not allowed is refused', async () => {
    const client = createClient(paired.secret)
    await saveAllowed(client, {
      connectionId: ids.proxied,
      connectionString: machineLoginString,
    })
    await expectError(
      client.query.mongodb.execute({
        connectionId: ids.proxied,
        query: 'db.users.find()',
      }),
      'UNCONFIRMED'
    )
  })

  test("a synced SSH tunnel is refused until saved on the bridge, since it uses this computer's keys", async () => {
    await expectError(
      createClient(paired.secret).query.postgres.execute({
        connectionId: ids.tunnel,
        query: 'select 1',
      }),
      'UNCONFIRMED'
    )
  })

  test.each([
    [
      'signs in another way',
      'postgresql://user:secret@db.internal:5432/app?ssh_host=bastion.example.com&ssh_user=deploy&ssh_auth=password',
    ],
    [
      'reaches another database host',
      'postgresql://user:secret@other.internal:5432/app?ssh_host=bastion.example.com&ssh_user=deploy&ssh_auth=agent',
    ],
  ])(
    'a synced tunnel that %s than the one saved on the bridge is refused',
    async (_, saved) => {
      const client = createClient(paired.secret)
      await saveAllowed(client, {
        connectionId: ids.tunnel,
        connectionString: saved,
      })
      await expectError(
        client.query.postgres.execute({
          connectionId: ids.tunnel,
          query: 'select 1',
        }),
        'UNCONFIRMED'
      )
    }
  )

  test('a save that points the bridge at a file it did not have is declined at the terminal', async () => {
    const client = createClient(paired.secret)
    await Promise.all([
      expectError(
        client.bridge.saveSecrets({
          connectionId: ids.metadataOnly,
          connectionString: `sqlite://${path.join(home, 'Cookies')}`,
        }),
        'ACCESS_DECLINED'
      ),
      answer(false),
    ])
    expect((await vault.connection(ids.metadataOnly)) ?? '').not.toContain(
      'Cookies'
    )
  })

  test('secrets are saved only for a connection Tamery confirms', async () => {
    const client = createClient(paired.secret)
    await expectError(
      client.bridge.saveSecrets({
        connectionId: ids.gone,
        connectionString: sqliteString,
      }),
      'NOT_FOUND'
    )
    await expect(
      client.bridge.saveSecrets({
        connectionId: '6f1c2b3a-0000-4000-8000-000000000001',
        connectionString: sqliteString,
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    apiDown = true
    try {
      await expect(
        client.bridge.saveSecrets({
          connectionId: ids.unresolved,
          connectionString: sqliteString,
        })
      ).rejects.toThrow()
    } finally {
      apiDown = false
    }
    expect(await vault.connection(ids.gone)).toBeNull()
    expect(await vault.connection(ids.unresolved)).toBeNull()
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
    await saveAllowed(client, {
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

  test('a query cannot reach a SQLite file other than the one allowed', async () => {
    const error = await createClient(paired.secret)
      .query.sqlite.execute({
        connectionId: ids.full,
        query: `attach database '${path.join(home, 'other.db')}' as other`,
      })
      .catch((error_: unknown) => error_)
    expect(error).toMatchObject({
      message: expect.stringMatching(/not authorized/iu),
    })
    await expect(
      createClient(paired.secret).query.sqlite.execute({
        connectionId: ids.full,
        query: `vacuum into '${path.join(home, 'copy.db')}'`,
      })
    ).rejects.toThrow()
    expect(fs.existsSync(path.join(home, 'copy.db'))).toBe(false)
  })

  test('VACUUM still runs, since it attaches no file', async () => {
    await createClient(paired.secret).query.sqlite.execute({
      connectionId: ids.full,
      query: 'vacuum',
    })
  })

  test('a connection runs only as its own dialect, so another one cannot open its path as a file', async () => {
    await expect(
      createClient(paired.secret).query.sqlite.execute({
        connectionId: ids.socketless,
        query: 'select 1',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  test('a session Tamery ended stops even a locally saved connection', async () => {
    await vault.setConnection(ids.unresolved, sqliteString)
    signedOut = true
    try {
      await expect(
        createClient(paired.secret).query.sqlite.execute({
          connectionId: ids.unresolved,
          query: 'select 1',
        })
      ).rejects.toThrow()
    } finally {
      signedOut = false
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
      .query.sqlite.execute({
        connectionString: sqliteString,
        query: 'select 1',
      } as never)
      .catch((error_: unknown) => error_)
    expect(error).toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('vault', () => {
  test('a vault another process rewrote is read, never overwritten with an older copy', async () => {
    const account = { email: 'other@tamery.test', id: 'user-2', token: 't' }
    configFiles.write(
      configFiles.vault,
      encrypt({
        secret: 'test-key',
        text: JSON.stringify({ account, connections: {} }),
      })
    )
    await vault.setConnection(ids.full, sqliteString)
    expect(await vault.account()).toEqual(account)
  })

  test('logout resets a vault it cannot read', async () => {
    const { logout } = await import('../commands/logout')
    configFiles.write(configFiles.vault, 'not a vault')
    const keychain = spyOn(Bun.secrets, 'delete').mockResolvedValue(true)
    try {
      await expect(vault.account()).rejects.toThrow()
      await logout()
      expect(fs.existsSync(configFiles.vault)).toBe(false)
      expect(pairings.labels()).toHaveLength(0)
    } finally {
      keychain.mockRestore()
      fs.writeFileSync(configFiles.key, 'test-key')
    }
  })
})
