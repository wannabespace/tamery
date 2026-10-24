import { describe, expect, it } from 'bun:test'

import { ConnectionType } from '@tamery/shared/enums/connection-type'

import type { ConnectionParts } from './connection-parts'
import { connectionParts } from './connection-parts'
import { diagnoseConnectionError } from './diagnose'
import {
  EMPTY_SSH_TUNNEL,
  SSH_AUTH_ERRORS,
  SSH_TUNNEL_ERROR,
} from './ssh/params'

const parts = connectionParts.parse('postgres://me:pw@db.acme.io')

const diagnose = (message: string, overrides: Partial<ConnectionParts> = {}) =>
  diagnoseConnectionError({
    desktop: true,
    message,
    parts: { ...parts, ...overrides },
  })

describe('diagnoseConnectionError', () => {
  it.each([
    'SSH authentication failed. Check the SSH user and credentials.',
    "Can't reach the SSH host: ENOTFOUND",
    'Timed out reaching the SSH host',
  ])('blames the tunnel, not the database, for %s', (message) => {
    expect(
      diagnose(`${SSH_TUNNEL_ERROR}${message}`, { password: '' })
    ).toStrictEqual({
      hint: message,
      title: "Couldn't open the SSH tunnel",
    })
  })

  it.each([
    [SSH_AUTH_ERRORS.noKeyFile, 'ssh.keyPath'],
    [SSH_AUTH_ERRORS.passphraseNeeded, 'ssh.passphrase'],
    [SSH_AUTH_ERRORS.notAKey, 'ssh.privateKey'],
    [SSH_AUTH_ERRORS.keyFileNotAKey, 'ssh.keyPath'],
    [SSH_AUTH_ERRORS.passwordMissing, 'ssh.password'],
  ] as const)('sends %s to the field at fault', (message, field) => {
    expect(diagnose(`${SSH_TUNNEL_ERROR}${message}`)?.focus).toBe(field)
  })

  it('blames the SSH host when it cannot look up the database host', () => {
    expect(
      diagnose('(SSH) Channel open failure: Name does not resolve', {
        host: 'db.railway.internal',
        ssh: EMPTY_SSH_TUNNEL,
      })?.title
    ).toBe('The SSH host can\'t find "db.railway.internal"')
  })

  it.each([
    '(SSH) Channel open failure: open failed',
    '(SSH) Channel open failure: administratively prohibited',
  ])('blames the SSH host for forbidding the forward in %s', (message) => {
    expect(diagnose(message, { password: '' })).toStrictEqual({
      hint: 'Its sshd forbids forwarding to the database (AllowTcpForwarding or PermitOpen). Ask its admin to allow it for your SSH user.',
      title: "The SSH host doesn't allow port forwarding",
    })
  })

  it('reads a channel the bastion could not open as a database error', () => {
    expect(
      diagnose('(SSH) Channel open failure: Connection refused')?.title
    ).toBe('Connection refused')
  })

  it('points a Docker service name at localhost', () => {
    expect(
      diagnose('getaddrinfo ENOTFOUND postgres', { host: 'postgres' })?.fix
    ).toStrictEqual({
      label: 'Use localhost',
      patch: { host: 'localhost' },
    })
  })

  it('asks for the empty password a remote server will want next', () => {
    expect(
      diagnose('connect EHOSTUNREACH 2a05::1:5432', { password: '' })?.focus
    ).toBe('password')
    expect(
      diagnose('connect ECONNREFUSED 127.0.0.1:5432', {
        host: 'localhost',
        password: '',
      })?.focus
    ).toBeUndefined()
  })

  it('offers a tunnel for a private host that times out', () => {
    expect(
      diagnose('connect ETIMEDOUT 10.0.3.4:5432', { host: '10.0.3.4' })?.fix
        ?.patch
    ).toStrictEqual({
      sshEnabled: true,
    })
  })

  it("turns on SSL in the engine's own option, keeping the others", () => {
    expect(
      diagnose(
        'no pg_hba.conf entry for host "1.2.3.4", user "me", database "app", no encryption',
        {
          options: 'application_name=tamery',
        }
      )?.fix?.patch
    ).toStrictEqual({ options: 'application_name=tamery&sslmode=require' })
  })

  it.each([
    [
      ConnectionType.Postgres,
      'sslmode=require&SSLRootCert=/ca.pem&sslkey=/k.pem&connect_timeout=5',
      'connect_timeout=5&sslmode=disable',
    ],
    [
      ConnectionType.MySQL,
      'ssl=true&sslca=/ca.pem&sslrejectunauthorized=true',
      'ssl=false',
    ],
    [ConnectionType.Oracle, 'ssl=true', 'ssl=false'],
    [
      ConnectionType.MongoDB,
      'tls=true&tlsCAFile=/ca.pem&replicaSet=rs0',
      'replicaSet=rs0&tls=false',
    ],
  ])(
    'turns off SSL on %s without the TLS options the driver refuses beside it',
    (type, options, fixed) => {
      expect(
        diagnose('The server does not support SSL connections', {
          options,
          type,
        })?.fix?.patch
      ).toStrictEqual({ options: fixed })
    }
  )

  it('skips the SQL Server certificate check under the key the driver reads', () => {
    expect(
      diagnose('self-signed certificate in certificate chain', {
        options: 'encrypt=true&TrustServerCertificate=false',
        type: ConnectionType.MSSQL,
      })?.fix?.patch
    ).toStrictEqual({ options: 'encrypt=true&trustservercertificate=true' })
  })

  it('signs a MongoDB user in through admin when the string names no authSource', () => {
    expect(
      diagnose('Authentication failed.', {
        options: 'retryWrites=true',
        type: ConnectionType.MongoDB,
      })?.fix?.patch
    ).toStrictEqual({ options: 'retryWrites=true&authSource=admin' })
  })

  it('switches the engine when the port belongs to another one', () => {
    expect(
      diagnose('connect ECONNREFUSED 1.2.3.4:3306', { port: '3306' })?.fix
        ?.patch
    ).toStrictEqual({
      type: ConnectionType.MySQL,
    })
  })

  it("names the missing database and falls back to the server's default", () => {
    const diagnosis = diagnose('database "shop" does not exist', {
      database: 'shop',
    })
    expect(diagnosis?.title).toBe('Database "shop" doesn\'t exist')
    expect(diagnosis?.fix?.patch).toStrictEqual({ database: 'postgres' })
    expect(
      diagnose("Unknown database 'shop'", {
        database: 'shop',
        type: ConnectionType.MySQL,
      })?.fix?.patch
    ).toStrictEqual({ database: '' })
  })

  it('offers no default database when the default is the one missing', () => {
    expect(
      diagnose('database "postgres" does not exist', { database: 'postgres' })
        ?.fix
    ).toBeUndefined()
  })

  it('asks for the project ref in a Supabase pooler user', () => {
    expect(
      diagnose('password authentication failed for user "postgres"', {
        host: 'aws-0-eu-central-1.pooler.supabase.com',
        user: 'postgres',
      })?.focus
    ).toBe('user')
  })

  it("asks for the password node-postgres won't send empty", () => {
    expect(
      diagnose(
        'SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string',
        { password: '' }
      )
    ).toMatchObject({
      focus: 'password',
      title: 'This server needs a password',
    })
  })

  it.each([
    [
      "Access denied for user 'me'@'%' to database 'app'",
      "This user can't open that database",
    ],
    [
      'Cannot open database "app" requested by the login. The login failed. Login failed for user \'me\'.',
      'Database "app" doesn\'t exist',
    ],
    ['role "me" does not exist', 'User "me" doesn\'t exist'],
    [
      "Host '203.0.113.7' is not allowed to connect to this MySQL server",
      "This user can't connect from your address",
    ],
    ['Tenant or user not found', "Supabase can't find this project"],
    [
      'ORA-01017: invalid credential or not authorized; logon denied',
      'Wrong user or password',
    ],
    [
      'no pg_hba.conf entry for host "203.0.113.7", user "me", database "app", SSL encryption',
      "The server doesn't accept connections from here",
    ],
    [
      "Authentication plugin 'caching_sha2_password' reported error: Authentication requires secure connection.",
      'This sign-in needs SSL',
    ],
    ['the database system is starting up', "The database isn't ready"],
    ['Connection terminated unexpectedly', 'The server closed the connection'],
    ['sorry, too many clients already', 'The server is out of connections'],
    [
      'Failed to connect to db.acme.io:1433 - Could not connect (sequence)',
      'Connection refused',
    ],
  ])('names %p', (message, title) => {
    expect(diagnose(message)?.title).toBe(title)
  })

  it('sends an Oracle service the listener lacks to the service field', () => {
    expect(
      diagnose(
        'NJS-518: cannot connect to Oracle Database. Service "NOPE" is not registered with the listener at host 127.0.0.1 port 1521.',
        { database: 'NOPE', type: ConnectionType.Oracle }
      )
    ).toMatchObject({
      focus: 'database',
      title: 'Service "NOPE" isn\'t on this server',
    })
  })

  it('reads a missing SQLite file without asking for a password', () => {
    expect(
      diagnose('Unable to open database file', {
        database: '/srv/app.db',
        host: '',
        password: '',
        type: ConnectionType.SQLite,
      })?.title
    ).toBe("Can't open the database file")
  })

  it('offers http:// when a ClickHouse port answers without TLS', () => {
    expect(
      diagnose(
        'write EPROTO 1254133270560:error:100000f7:SSL routines:OPENSSL_internal:WRONG_VERSION_NUMBER',
        connectionParts.parse('https://default:pw@ch.acme.io:8124')
      )?.fix
    ).toStrictEqual({ label: 'Use http://', patch: { https: false } })
  })

  it('returns nothing for an error it does not know', () => {
    expect(diagnose('something odd happened')).toBeNull()
  })
})
