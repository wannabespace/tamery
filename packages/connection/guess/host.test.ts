import { describe, expect, it } from 'bun:test'

import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

import { guessConnection } from './index'

describe('guessConnection — bare hosts', () => {
  it.each([
    [
      'db.acme.io:5432',
      { host: 'db.acme.io', port: '5432', type: ConnectionType.Postgres },
    ],
    [
      'db.acme.io:6543/app',
      {
        database: 'app',
        host: 'db.acme.io',
        port: '6543',
        type: ConnectionType.Postgres,
      },
    ],
    [
      'cluster0.abcde.mongodb.net',
      {
        host: 'cluster0.abcde.mongodb.net',
        provider: Provider.MongoDBAtlas,
        type: ConnectionType.MongoDB,
      },
    ],
    [
      'localhost:3306',
      { host: 'localhost', port: '3306', type: ConnectionType.MySQL },
    ],
    [
      'me:pw@ch.local:9000/logs',
      {
        database: 'logs',
        host: 'ch.local',
        password: 'pw',
        port: '8123',
        type: ConnectionType.ClickHouse,
        user: 'me',
      },
    ],
    ['db.acme.io', { host: 'db.acme.io' }],
  ])('reads %s', (text, parts) => {
    const guess = guessConnection(text)
    expect(guess?.format).toBe('host')
    expect(guess?.parts).toStrictEqual(parts)
  })

  it.each([
    ['abc.supabase.co', ConnectionType.Postgres],
    ['aws-0-eu-central-1.pooler.supabase.com', ConnectionType.Postgres],
    ['ep-cool-name.eu-central-1.aws.neon.tech', ConnectionType.Postgres],
    ['acme.database.windows.net', ConnectionType.MSSQL],
    ['aws.connect.psdb.cloud', ConnectionType.MySQL],
    ['gateway01.eu-central-1.prod.aws.tidbcloud.com', ConnectionType.MySQL],
    ['adb.eu-frankfurt-1.oraclecloud.com', ConnectionType.Oracle],
  ])('types %s from its provider', (host, type) => {
    expect(guessConnection(host)?.parts.type).toBe(type)
  })

  it('gives ClickHouse Cloud its https port', () => {
    expect(
      guessConnection('abc.eu-west-1.aws.clickhouse.cloud')?.parts
    ).toMatchObject({
      port: '8443',
      type: ConnectionType.ClickHouse,
    })
  })

  it('types a provider that hosts several engines by port', () => {
    expect(
      guessConnection('mydb.abc123.us-east-1.rds.amazonaws.com:3306')?.parts
        .type
    ).toBe(ConnectionType.MySQL)
  })

  it.each(['redis://u:p@cache.acme.io:6379', 'README.md'])(
    'ignores %s',
    (text) => {
      expect(guessConnection(text)).toBeNull()
    }
  )

  it('lets an explicit scheme beat the host hint and port', () => {
    expect(
      guessConnection('mysql://u@abc.supabase.co:5432/app')?.parts.type
    ).toBe(ConnectionType.MySQL)
  })
})
