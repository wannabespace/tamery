import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'

import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { toError } from '@tamery/shared/utils'
import { Client } from 'ssh2'

import type { ConnectionParts } from './connection-parts'
import { connectionParts } from './connection-parts'
import {
  getDiagnosisRequest,
  sanitizeDiagnosisRequest,
} from './diagnosis-request'
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
      error: 'password authentication failed for user "<user>" (<redacted>)',
      hostKind: 'public host',
      options: 'sslmode=require',
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

  it('never writes a value into a placeholder', () => {
    expect(
      request('hunter22 rejected for word', {
        password: 'hunter22',
        user: 'word',
      }).error
    ).toBe('<password> rejected for <user>')
  })

  it.each([
    [
      "SSH tunnel: Can't reach the SSH host at bastion.corp.io: ECONNREFUSED",
      'SSH tunnel: The SSH host refused the connection',
    ],
    [
      "SSH tunnel: Can't reach the SSH host at [fe80::1%en0]:2222: ECONNRESET",
      "SSH tunnel: Can't reach the SSH host",
    ],
    [
      'SSH tunnel: Timed out connecting to the SSH host at bastion.corp.io',
      'SSH tunnel: Timed out reaching the SSH host',
    ],
    [
      'SSH tunnel: SSH connection failed: Disconnected by bastion.corp.io',
      'SSH tunnel: SSH connection failed',
    ],
    [
      'Unexpected line break at bastion.corp.io',
      "SSH tunnel: ~/.ssh/config couldn't be used",
    ],
    [
      'Missing value for match criteria bastion.corp.io',
      "SSH tunnel: ~/.ssh/config couldn't be used",
    ],
    [
      'Failed to connect to db:1433 - (SSH) Channel open failure: Connection refused by bastion.corp.io',
      "SSH tunnel: The SSH host didn't forward the connection to the database",
    ],
    [
      'SSH tunnel: Several containers run the service db: app-db-1, staging-db-1. Use the container name as the host.',
      "SSH tunnel: The SSH host couldn't find the database container",
    ],
    [
      "SSH tunnel: The SSH host presented a key that doesn't match known_hosts",
      "SSH tunnel: The SSH host's key wasn't trusted",
    ],
    [
      'SSH tunnel: SSH authentication failed. Check the SSH user and credentials.',
      'SSH tunnel: SSH sign-in failed',
    ],
  ])('sends the SSH failure %s only as its kind', (message, error) => {
    expect(
      request(message, {
        ssh: { ...EMPTY_SSH_TUNNEL, host: 'prod' },
        user: 'admin',
      }).error
    ).toBe(error)
  })

  it('sends no SSH secret, alias or user', () => {
    expect(
      request('auth failed: p%40ss!, hunter2, s3cret, SSH and tunnel', {
        password: 'p@ss!',
        ssh: {
          ...EMPTY_SSH_TUNNEL,
          host: 'SSH',
          passphrase: 's3cret',
          password: 'hunter2',
          user: 'tunnel',
        },
      }).error
    ).toBe('SSH tunnel: SSH sign-in failed')
  })

  it.each([
    [
      'database "database" does not exist',
      '<database> "<database>" does not exist',
    ],
    [
      'password authentication failed for user "me"',
      'password authentication failed for user "<user>"',
    ],
    ['relation "orders" is locked', 'relation "orders" is locked'],
  ])('keeps the driver error %s of a tunneled connection', (message, error) => {
    expect(
      request(message, { database: 'database', ssh: EMPTY_SSH_TUNNEL }).error
    ).toBe(error)
  })

  it.each([
    'database "database" does not exist',
    'Failed to connect to db:1433 - (SSH) Channel open failure: open failed',
    'SSH tunnel: SSH connection failed: Disconnected by bastion.corp.io',
    'SSH tunnel: Timed out reaching the SSH host',
    "SSH tunnel: Can't reach the SSH host at [2001:db8::5%eth0]:2222: ECONNREFUSED",
  ])('the API sends %s as the client did', (message) => {
    const sent = request(message, {
      database: 'database',
      ssh: { ...EMPTY_SSH_TUNNEL, host: 'prod' },
    })
    expect(sanitizeDiagnosisRequest(sent)).toStrictEqual(sent)
  })

  it('keeps only option values that name nothing', () => {
    expect(
      request('timeout', {
        options:
          'sslmode=verify-full&connect_timeout=10&ssl=true&sslservername=prod.internal&application_name=billing',
      }).options
    ).toBe('sslmode=verify-full&connect_timeout=10&ssl=true')
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
    ).toBe('sslMode=require')
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

  const failedSession = async (config: string, failure?: Error) => {
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
      const shown = toError(connected).message
      return { sent: request(shown, { ssh }).error, shown }
    } finally {
      await rm(home, { force: true, recursive: true })
    }
  }

  it.each([
    [
      'fe80::1%en0',
      'ECONNREFUSED',
      'SSH tunnel: The SSH host refused the connection',
    ],
    ['10.0.0.20', 'EHOSTUNREACH', "SSH tunnel: Can't reach the SSH host"],
  ])('shows %s and %s, but sends only %s', async (host, code, sent) => {
    expect(
      await failedSession(
        `Host prod\n  HostName ${host}\n`,
        Object.assign(new Error(`connect ${code} ${host}:22`), {
          code,
          level: 'client-socket',
        })
      )
    ).toEqual({
      sent,
      shown: `SSH tunnel: Can't reach the SSH host at ${host}: ${code}`,
    })
  })

  it('shows what ssh2 described but sends only its kind', async () => {
    expect(
      await failedSession(
        'Host prod\n  HostName 10.0.0.20\n',
        Object.assign(new Error('Disconnected by bastion.internal'), {
          level: 'protocol',
        })
      )
    ).toEqual({
      sent: 'SSH tunnel: SSH connection failed',
      shown:
        'SSH tunnel: SSH connection failed: Disconnected by bastion.internal',
    })
  })

  it('shows why the config could not be parsed but sends only its kind', async () => {
    expect(
      await failedSession('Host prod\n  HostName "bastion.internal')
    ).toEqual({
      sent: "SSH tunnel: ~/.ssh/config couldn't be used",
      shown: 'Unexpected line break at bastion.internal',
    })
  })
})
