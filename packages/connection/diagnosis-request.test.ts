import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'

import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { toError } from '@tamery/shared/utils'
import { Client } from 'ssh2'

import type { ConnectionParts } from './connection-parts'
import { connectionParts } from './connection-parts'
import { getDiagnosisRequest, SSH_ON_ERRORS } from './diagnosis-request'
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
      request(
        'SSH tunnel: SSH authentication failed: p%40ss!, hunter2, s3cret, SSH and tunnel',
        {
          password: 'p@ss!',
          ssh: {
            ...EMPTY_SSH_TUNNEL,
            host: 'SSH',
            passphrase: 's3cret',
            password: 'hunter2',
            user: 'tunnel',
          },
        }
      ).error
    ).toBe('SSH tunnel: SSH sign-in failed')
  })

  it.each([
    ['database "database" does not exist', 'Database does not exist'],
    ['role "me" does not exist', 'Database user does not exist'],
    ['password authentication failed for user "me"', 'Database sign-in failed'],
    ['relation "orders" is locked', 'Connection failed'],
    [
      'no pg_hba.conf entry for host "203.0.113.7", user "me", database "app", no encryption',
      'Database requires SSL',
    ],
    [
      'no pg_hba.conf entry for host "203.0.113.7", user "me", database "app", SSL encryption',
      "Database server doesn't allow connections from this address",
    ],
    [
      "Access denied for user 'me'@'%' to database 'app'",
      "Database user can't open that database",
    ],
    ['sorry, too many clients already', 'Database has too many connections'],
    [
      'self-signed certificate in certificate chain',
      "Database certificate couldn't be verified",
    ],
    [
      'permission denied for database "docker_tunnel"',
      "Database user can't open that database",
    ],
  ])(
    'sends the driver error %s of a tunneled connection as %s',
    (message, error) => {
      expect(
        request(message, { database: 'database', ssh: EMPTY_SSH_TUNNEL }).error
      ).toBe(error)
    }
  )

  it.each([
    [
      'database "docker_app" does not exist',
      { database: 'docker_app' },
      'Database does not exist',
    ],
    [
      'password authentication failed for user "tunnel_reader"',
      { user: 'tunnel_reader' },
      'Database sign-in failed',
    ],
  ])(
    'blames the database for %s, whatever its names say',
    (message, overrides, error) => {
      expect(
        request(message, { ...overrides, ssh: EMPTY_SSH_TUNNEL }).error
      ).toBe(error)
    }
  )

  it('sends only a fixed error with SSH on, whatever the names are', () => {
    const names = ['SSH', 'tunnel', 'Channel', 'host', 'database', 'failed']
    const failures = [
      'SSH tunnel: SSH connection failed: Disconnected by bastion.corp.io',
      '(SSH) Channel open failure: Connection refused by bastion.corp.io',
      "SSH tunnel: Can't reach the SSH host at bastion.corp.io: ECONNREFUSED",
      'Unexpected line break at ssl-does-not-exist.corp.io',
      'password authentication failed for user "SSH"',
      'database "tunnel" does not exist',
    ]
    const errors = failures.flatMap((message) =>
      names.flatMap((user) =>
        names.map(
          (database) =>
            request(message, {
              database,
              ssh: { ...EMPTY_SSH_TUNNEL, host: user, user: database },
              user,
            }).error
        )
      )
    )
    expect(new Set(errors).isSubsetOf(SSH_ON_ERRORS)).toBe(true)
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
