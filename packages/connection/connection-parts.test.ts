import { describe, expect, it } from 'bun:test'

import { ConnectionType } from '@tamery/shared/enums/connection-type'

import type { ConnectionParts } from './connection-parts'
import { connectionParts } from './connection-parts'
import { getDriverConfig } from './parse-connection-string'
import { connectionSecrets } from './secrets'
import { EMPTY_SSH_TUNNEL } from './ssh/params'

const parts = (overrides: Partial<ConnectionParts>): ConnectionParts => ({
  database: 'app',
  host: 'db.acme.io',
  https: null,
  options: '',
  password: 'pw',
  port: '5432',
  provider: null,
  ssh: null,
  type: ConnectionType.Postgres,
  user: 'me',
  ...overrides,
})

const VALUES = [
  'p w',
  'a?b',
  'a#b',
  '100%',
  'foo%3Fbar',
  'me@srv',
  'a/b',
  'пароль 🔑',
]

const missingAfterEdit = (ssh: ConnectionParts['ssh']) =>
  connectionSecrets.missing(
    new URL(connectionParts.format(parts({ ssh }), ['ssh_password']))
      .searchParams
  )

describe('connectionParts', () => {
  it.each(VALUES)('hands %p to the driver as typed', (value) => {
    expect(
      getDriverConfig(
        connectionParts.format(
          parts({ database: value, password: value, user: value })
        )
      )
    ).toMatchObject({ database: value, password: value, user: value })
  })

  it.each(VALUES)('reads %p back into the same parts', (value) => {
    const original = parts({
      database: value,
      options: 'sslmode=require',
      password: value,
      user: value,
    })
    expect(
      connectionParts.parse(connectionParts.format(original))
    ).toStrictEqual(original)
  })

  it.each(
    Object.values(ConnectionType).filter(
      (type) => type !== ConnectionType.SQLite
    )
  )('reads a %s string back as its type', (type) => {
    expect(
      connectionParts.parse(connectionParts.format(parts({ type }))).type
    ).toBe(type)
  })

  it.each(['::1', 'fe80::1', '2001:db8::5'])(
    'brackets the IPv6 host %p',
    (host) => {
      const connectionString = connectionParts.format(parts({ host }))
      expect(connectionString).toContain(`[${host}]`)
      expect(getDriverConfig(connectionString).host).toBe(host)
    }
  )

  it.each([
    [true, '9443', 'https://me:pw@ch.acme.io:9443/logs'],
    [false, '8443', 'http://me:pw@ch.acme.io:8443/logs'],
    [null, '8443', 'https://me:pw@ch.acme.io:8443/logs'],
    [null, '8123', 'http://me:pw@ch.acme.io:8123/logs'],
    [null, '9443', 'https://me:pw@ch.acme.io:9443/logs'],
  ])(
    'keeps ClickHouse on https=%p over port %p',
    (https, port, connectionString) => {
      const clickhouse = parts({
        database: 'logs',
        host: 'ch.acme.io',
        https,
        port,
        type: ConnectionType.ClickHouse,
      })
      expect(connectionParts.format(clickhouse)).toBe(connectionString)
    }
  )
  it('keeps asking for an SSH secret an edit left empty, only while the tunnel uses it', () => {
    const tunnel = {
      ...EMPTY_SSH_TUNNEL,
      auth: 'password' as const,
      host: 'bastion',
    }

    expect(missingAfterEdit(tunnel)).toEqual(['ssh_password'])
    expect(missingAfterEdit({ ...tunnel, auth: 'agent' })).toEqual([])
    expect(missingAfterEdit(null)).toEqual([])
  })
})
