import {
  afterEach,
  beforeEach,
  expect,
  jest,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'

import { EMPTY_SSH_TUNNEL } from './params'
import { connectSsh } from './session'

let home = ''

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'tamery-ssh-'))
  spyOn(os, 'homedir').mockReturnValue(home)
})

afterEach(async () => {
  mock.restore()
  await rm(home, { force: true, recursive: true })
})

test('a key ssh2 cannot parse fails as a tunnel error and arms no handshake timeout', async () => {
  const rejections: unknown[] = []
  const collect = (reason: unknown) => rejections.push(reason)
  process.on('unhandledRejection', collect)
  jest.useFakeTimers()
  try {
    await expect(
      connectSsh(
        {
          ...EMPTY_SSH_TUNNEL,
          auth: 'key',
          host: '127.0.0.1',
          privateKey: 'not a key',
        },
        () => Promise.resolve(false)
      )
    ).rejects.toThrow("SSH tunnel: That isn't an SSH private key")
    jest.advanceTimersByTime(60_000)
    jest.useRealTimers()
    await Bun.sleep(10)
    expect(rejections).toEqual([])
  } finally {
    jest.useRealTimers()
    process.off('unhandledRejection', collect)
  }
})

test('a ProxyJump from an included ~/.ssh/config file fails instead of dialing the host directly', async () => {
  await mkdir(path.join(home, '.ssh', 'config.d'), { recursive: true })
  await writeFile(path.join(home, '.ssh', 'config'), 'Include config.d/*\n')
  await writeFile(
    path.join(home, '.ssh', 'config.d', 'bastion'),
    'Host bastion\n  ProxyJump jump.example.com\n'
  )
  await expect(
    connectSsh({ ...EMPTY_SSH_TUNNEL, host: 'bastion' }, () =>
      Promise.resolve(false)
    )
  ).rejects.toThrow(
    "SSH tunnel: ProxyJump in ~/.ssh/config isn't supported yet"
  )
})

test('an alias that resolves to an IPv6-only host fails as unreachable from this device', async () => {
  await mkdir(path.join(home, '.ssh'), { recursive: true })
  await writeFile(
    path.join(home, '.ssh', 'config'),
    'Host prod\n  HostName db.tamery-test-missing.supabase.co\n'
  )
  await expect(
    connectSsh(
      { ...EMPTY_SSH_TUNNEL, auth: 'password', host: 'prod', password: 'pw' },
      () => Promise.resolve(false)
    )
  ).rejects.toThrow(
    /^SSH tunnel: Can't reach the SSH host: (?:ENOTFOUND|EAI_AGAIN)$/u
  )
})

test('an alias that resolves to a private host never fails as unreachable from this device', async () => {
  await mkdir(path.join(home, '.ssh'), { recursive: true })
  await writeFile(
    path.join(home, '.ssh', 'config'),
    'Host bastion.acme.io\n  HostName bastion.internal\n'
  )
  await expect(
    connectSsh(
      {
        ...EMPTY_SSH_TUNNEL,
        auth: 'password',
        host: 'bastion.acme.io',
        password: 'pw',
      },
      () => Promise.resolve(false)
    )
  ).rejects.toThrow(
    /^SSH tunnel: Can't reach the SSH host at bastion\.internal: /u
  )
})
