import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'

import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { toError } from '@tamery/shared/utils'
import { Client } from 'ssh2'

import type { ConnectionParts } from './connection-parts'
import { connectionParts } from './connection-parts'
import { getDiagnosisRequest, redactSshFailure } from './diagnosis-request'
import { EMPTY_SSH_TUNNEL } from './ssh/params'
import { connectSsh } from './ssh/session'

const parts = connectionParts.parse('postgres://me:pw@db.acme.io')

const request = (message: string, overrides: Partial<ConnectionParts> = {}) =>
  getDiagnosisRequest({ message, parts: { ...parts, ...overrides } })

describe('getDiagnosisRequest', () => {
  it('carries no address, user or secret option value', () => {
    expect(
      request('password authentication failed for user "me" (hunter2)', {
        options: 'sslmode=require&sslpassword=hunter2',
      })
    ).toStrictEqual({
      error: 'password authentication failed for user "<user>" (<sslpassword>)',
      hostKind: 'public host',
      options: 'sslmode=require&sslpassword=%3Credacted%3E',
      passwordSet: true,
      port: '5432',
      sshEnabled: false,
      type: ConnectionType.Postgres,
      userSet: true,
    })
  })

  it.each([
    [
      'password authentication failed for user "me" at db.acme.io/app',
      'password authentication failed for user "<user>" at <host>/<database>',
    ],
    [
      'no pg_hba.conf entry for host "2a02:810d:4b3f:e300::1f", user "me"',
      'no pg_hba.conf entry for host "<ip>", user "<user>"',
    ],
    [
      "Access denied for user 'root'@'2001:db8::5' (using password: YES)",
      "Access denied for user 'root'@'<ip>' (using password: YES)",
    ],
    [
      'connect ECONNREFUSED [fe80::1%en0]:5432, then 10.0.0.7:5432',
      'connect ECONNREFUSED [<ip>]:5432, then <ip>:5432',
    ],
    [
      'connect ETIMEDOUT ::ffff:192.0.2.1:5432',
      'connect ETIMEDOUT ::ffff:<ip>:5432',
    ],
  ])('redacts %s', (message, error) => {
    expect(request(message, { database: 'app' }).error).toBe(error)
  })

  it('redacts the SSH secrets, percent-encoded too', () => {
    expect(
      request('auth failed: p%40ss!, hunter2 and s3cret', {
        password: 'p@ss!',
        ssh: { ...EMPTY_SSH_TUNNEL, passphrase: 's3cret', password: 'hunter2' },
      }).error
    ).toBe('auth failed: <password>, <ssh-password> and <ssh-passphrase>')
  })

  it('redacts the SSH host ~/.ssh/config resolved an alias to', () => {
    const ssh = { ...EMPTY_SSH_TUNNEL, host: 'bastion', user: 'deploy' }
    expect([
      request(
        "SSH tunnel: Can't reach the SSH host at bastion.corp.io: ECONNREFUSED",
        { ssh, user: 'admin' }
      ).error,
      request("SSH tunnel: Can't reach the SSH host at fe80::1: ECONNRESET", {
        ssh,
      }).error,
      request(
        'SSH tunnel: Timed out connecting to the SSH host at bastion.corp.io',
        { ssh, user: 'admin' }
      ).error,
    ]).toStrictEqual([
      "SSH tunnel: Can't reach the SSH host at <ssh-host>: ECONNREFUSED",
      "SSH tunnel: Can't reach the SSH host at <ssh-host>: ECONNRESET",
      'SSH tunnel: Timed out connecting to the SSH host at <ssh-host>',
    ])
  })

  it('never writes a value into a placeholder', () => {
    expect(
      request(
        "SSH tunnel: Can't reach the SSH host at bastion.corp.io: ECONNREFUSED",
        { ssh: { ...EMPTY_SSH_TUNNEL, host: 'ssh-host' }, user: 'user' }
      ).error
    ).toBe("SSH tunnel: Can't reach the SSH host at <ssh-host>: ECONNREFUSED")
  })

  it.each([
    [
      'SSH tunnel: SSH connection failed: Disconnected by bastion.corp.io',
      'SSH tunnel: SSH connection failed',
    ],
    [
      "SSH tunnel: ~/.ssh/config couldn't be parsed: Unexpected line break at bastion.corp.io",
      "SSH tunnel: ~/.ssh/config couldn't be parsed",
    ],
    [
      'Unexpected line break at bastion.corp.io',
      "SSH tunnel: ~/.ssh/config couldn't be parsed",
    ],
    [
      'SSH tunnel: SSH connection failed: the SSH host closed the connection',
      'SSH tunnel: SSH connection failed: the SSH host closed the connection',
    ],
    [
      'SSH tunnel: Timed out reaching the SSH host',
      'SSH tunnel: Timed out reaching the SSH host',
    ],
  ])('sends the SSH failure %s only as its kind', (message, error) => {
    expect(
      request(message, { ssh: EMPTY_SSH_TUNNEL, user: 'admin' }).error
    ).toBe(error)
  })

  it('keeps a bare parse error of a connection without SSH', () => {
    expect(redactSshFailure('Unexpected line break at x', false)).toBe(
      'Unexpected line break at x'
    )
  })

  it('keeps only option values that name nothing', () => {
    expect(
      request('timeout', {
        options:
          'sslmode=verify-full&connect_timeout=10&ssl=true&sslservername=prod.internal&application_name=billing',
      }).options
    ).toBe(
      'sslmode=verify-full&connect_timeout=10&ssl=true&sslservername=%3Credacted%3E&application_name=%3Credacted%3E'
    )
  })

  it.each([
    ['db.abcd.supabase.co', 'Supabase direct host (IPv6-only)'],
    ['ep-x.eu-central-1.aws.neon.tech', 'Neon public host'],
    ['postgres', 'single-label name (Docker service?)'],
    ['10.0.0.7', 'private network'],
  ])('names the kind of %s without the address', (host, hostKind) => {
    expect(request('timeout', { host }).hostKind).toBe(hostKind)
  })

  it('redacts a secret option whatever its value looks like', () => {
    expect(
      request('timeout', {
        options: 'SSLPassword=123456&ssh_passphrase=true&sslMode=require',
      }).options
    ).toBe(
      'SSLPassword=%3Credacted%3E&ssh_passphrase=%3Credacted%3E&sslMode=require'
    )
  })
})

const refuseHostKey = () => Promise.resolve(false)

describe('a failed SSH session', () => {
  const ssh = {
    ...EMPTY_SSH_TUNNEL,
    auth: 'password' as const,
    host: 'prod',
    password: 'pw',
  }

  afterEach(() => {
    mock.restore()
  })

  const sessionError = async (config: string, failure?: Error) => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'tamery-ssh-'))
    try {
      spyOn(os, 'homedir').mockReturnValue(home)
      await mkdir(path.join(home, '.ssh'))
      await writeFile(path.join(home, '.ssh', 'config'), config)
      spyOn(Client.prototype, 'connect').mockImplementation(
        function failConnect(this: Client) {
          queueMicrotask(() => this.emit('error', failure))
          return this
        }
      )
      const connected = await connectSsh(ssh, refuseHostKey).catch(toError)
      return request(toError(connected).message, { ssh }).error
    } finally {
      await rm(home, { force: true, recursive: true })
    }
  }

  it.each([
    ['fe80::1%en0', 'ECONNREFUSED'],
    ['10.0.0.20', 'EHOSTUNREACH'],
  ])('sends neither %s nor its port, and keeps %s', async (host, code) => {
    expect(
      await sessionError(
        `Host prod\n  HostName ${host}\n  Port 2222\n`,
        Object.assign(new Error(`connect ${code} ${host}:2222`), {
          code,
          level: 'client-socket',
        })
      )
    ).toBe(`SSH tunnel: Can't reach the SSH host at <ssh-host>: ${code}`)
  })

  it('sends the kind of a failure ssh2 described', async () => {
    expect(
      await sessionError(
        'Host prod\n  HostName 10.0.0.20\n',
        Object.assign(
          new Error('Disconnected by 10.0.0.20 (bastion.internal)'),
          {
            level: 'protocol',
          }
        )
      )
    ).toBe('SSH tunnel: SSH connection failed')
  })

  it('sends the kind of a config it could not parse', async () => {
    expect(await sessionError('Host prod\n  HostName "bastion.internal')).toBe(
      "SSH tunnel: ~/.ssh/config couldn't be parsed"
    )
  })
})
