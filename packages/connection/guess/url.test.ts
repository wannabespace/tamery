import { describe, expect, it } from 'bun:test'

import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

import { guessConnection } from './index'

describe('guessConnection — URLs', () => {
  it.each([
    [
      'postgresql+asyncpg://me:p%40ss@db.acme.io:5432/app',
      {
        database: 'app',
        host: 'db.acme.io',
        password: 'p@ss',
        port: '5432',
        type: ConnectionType.Postgres,
        user: 'me',
      },
    ],
    [
      'mysql2://root:secret@localhost:3306/shop',
      {
        database: 'shop',
        host: 'localhost',
        password: 'secret',
        port: '3306',
        type: ConnectionType.MySQL,
        user: 'root',
      },
    ],
    [
      'mongodb://admin:pw@db.acme.io:27017/app?authSource=admin',
      {
        database: 'app',
        host: 'db.acme.io',
        options: 'authsource=admin',
        password: 'pw',
        port: '27017',
        type: ConnectionType.MongoDB,
        user: 'admin',
      },
    ],
    [
      'mongodb://app:pw@db1.acme.io:27017,db2.acme.io:27017/shop?replicaSet=rs0',
      {
        database: 'shop',
        host: 'db1.acme.io',
        options: 'replicaset=rs0',
        password: 'pw',
        port: '27017',
        type: ConnectionType.MongoDB,
        user: 'app',
      },
    ],
    [
      'mongodb+srv://app:pw@cluster0.abcde.mongodb.net/shop?retryWrites=true',
      {
        database: 'shop',
        host: 'cluster0.abcde.mongodb.net',
        options: 'retrywrites=true',
        password: 'pw',
        provider: Provider.MongoDBAtlas,
        type: ConnectionType.MongoDB,
        user: 'app',
      },
    ],
    [
      'mariadb://root@maria.local/shop',
      {
        database: 'shop',
        host: 'maria.local',
        type: ConnectionType.MariaDB,
        user: 'root',
      },
    ],
    [
      'sqlserver://sa:pass@mssql.local:1433/master',
      {
        database: 'master',
        host: 'mssql.local',
        password: 'pass',
        port: '1433',
        type: ConnectionType.MSSQL,
        user: 'sa',
      },
    ],
    [
      'https://default:pw@ch.acme.io:8443/logs',
      {
        database: 'logs',
        host: 'ch.acme.io',
        https: true,
        password: 'pw',
        port: '8443',
        type: ConnectionType.ClickHouse,
        user: 'default',
      },
    ],
    [
      'postgres://me:100%@db.acme.io/my%3Fdb',
      {
        database: 'my?db',
        host: 'db.acme.io',
        password: '100%',
        type: ConnectionType.Postgres,
        user: 'me',
      },
    ],
    [
      'postgres://me@db.acme.io/app?schema=public&sslmode=require',
      {
        database: 'app',
        host: 'db.acme.io',
        options: 'schema=public&sslmode=require',
        type: ConnectionType.Postgres,
        user: 'me',
      },
    ],
    [
      'oracle://app:pw@db.acme.io:1521/FREEPDB1?ssl=true',
      {
        database: 'FREEPDB1',
        host: 'db.acme.io',
        options: 'ssl=true',
        password: 'pw',
        port: '1521',
        type: ConnectionType.Oracle,
        user: 'app',
      },
    ],
    [
      'sqlplus scott/tiger@//db.acme.io:1521/ORCLPDB1',
      {
        database: 'ORCLPDB1',
        host: 'db.acme.io',
        password: 'tiger',
        port: '1521',
        type: ConnectionType.Oracle,
        user: 'scott',
      },
    ],
    [
      'scott/tiger@localhost/FREEPDB1',
      {
        database: 'FREEPDB1',
        host: 'localhost',
        password: 'tiger',
        type: ConnectionType.Oracle,
        user: 'scott',
      },
    ],
  ])('reads %s', (text, parts) => {
    const guess = guessConnection(text)
    expect(guess?.format).toBe('url')
    expect(guess?.parts).toStrictEqual(parts)
  })

  it('maps ClickHouse native ports to their HTTP twins', () => {
    expect(
      guessConnection('clickhouse://default@ch.acme.io:9440/logs')?.parts.port
    ).toBe('8443')
  })

  it.each([
    ['a page link', 'https://keyboard-support.app.local.tamery.app/settings'],
    ['a docs link', 'https://github.com/acme/app#readme'],
    [
      'a ClickHouse docs link',
      'https://clickhouse.com/docs/en/interfaces/http',
    ],
    [
      'a homepage in a config',
      '{ "name": "app", "homepage": "https://acme.io" }',
    ],
  ])('ignores %s', (_, text) => {
    expect(guessConnection(text)).toBeNull()
  })

  it.each([
    ['its HTTP port', 'http://localhost:8123'],
    ['a ClickHouse Cloud host', 'https://abc.eu-west-1.aws.clickhouse.cloud'],
  ])('reads a web URL as ClickHouse by %s', (_, text) => {
    expect(guessConnection(text)?.parts.type).toBe(ConnectionType.ClickHouse)
  })

  it('reads any web URL as ClickHouse once the text is known to name a database', () => {
    expect(
      guessConnection('http://localhost:58123', true)?.parts
    ).toMatchObject({
      host: 'localhost',
      https: false,
      port: '58123',
      type: 'clickhouse',
    })
  })

  it('reads the transport from a clickhouse-go secure parameter', () => {
    const parts = guessConnection(
      'clickhouse://u:p@localhost:58123/logs?secure=false'
    )?.parts
    expect(parts).toMatchObject({ https: false, port: '58123' })
    expect(parts?.options).toBeUndefined()
  })

  it.each([
    ['CLICKHOUSE_URL=https://ch.acme.io', { host: 'ch.acme.io', port: '443' }],
    [
      'CLICKHOUSE_URL=https://ch.acme.io:9443/logs',
      { database: 'logs', host: 'ch.acme.io', port: '9443' },
    ],
  ])('keeps https on ClickHouse in %s', (text, parts) => {
    expect(guessConnection(text)?.parts).toStrictEqual({
      ...parts,
      https: true,
      type: ConnectionType.ClickHouse,
    })
  })

  it.each([
    ['DATABASE_URL="postgres://me:pw@db.acme.io/app"'],
    ["psql 'postgres://me:pw@db.acme.io/app'"],
    ['Use postgres://me:pw@db.acme.io/app.'],
    ['{ "url": "postgres://me:pw@db.acme.io/app", "logging": true }'],
  ])('extracts the URL from %s', (text) => {
    expect(guessConnection(text)?.parts).toStrictEqual({
      database: 'app',
      host: 'db.acme.io',
      password: 'pw',
      type: ConnectionType.Postgres,
      user: 'me',
    })
  })

  it.each([['postgres://[::1]'], ['(postgres://[::1])']])(
    'keeps the bracket closing an IPv6 host in %s',
    (text) => {
      expect(guessConnection(text)?.parts.host).toBe('::1')
    }
  )

  it('keeps a query password out of the options when the URL has one too', () => {
    expect(
      guessConnection(
        'postgres://me:pw@db.acme.io/app?password=pw&sslmode=require'
      )?.parts.options
    ).toBe('sslmode=require')
  })

  it('keeps the ssh tunnel stored in a Tamery connection string', () => {
    expect(
      guessConnection(
        'postgres://me@db.internal/app?ssh_host=bastion.acme.io&ssh_user=ubuntu'
      )?.parts.ssh
    ).toMatchObject({ auth: 'agent', host: 'bastion.acme.io', user: 'ubuntu' })
  })
})

describe('guessConnection — JDBC', () => {
  it.each([
    [
      'jdbc:postgresql://db.acme.io:5432/app?user=me&password=pw&ssl=true',
      {
        database: 'app',
        host: 'db.acme.io',
        options: 'ssl=true',
        password: 'pw',
        port: '5432',
        type: ConnectionType.Postgres,
        user: 'me',
      },
    ],
    [
      'jdbc:mysql://db.acme.io:3306/shop?user=root&password=pw',
      {
        database: 'shop',
        host: 'db.acme.io',
        password: 'pw',
        port: '3306',
        type: ConnectionType.MySQL,
        user: 'root',
      },
    ],
    [
      'jdbc:postgresql://srv.postgres.database.azure.com:5432/db?user=admin@srv&password=pw&sslmode=require',
      {
        database: 'db',
        host: 'srv.postgres.database.azure.com',
        options: 'sslmode=require',
        password: 'pw',
        port: '5432',
        type: ConnectionType.Postgres,
        user: 'admin@srv',
      },
    ],
    [
      'jdbc:mysql://srv.mysql.database.azure.com:3306/db?user=admin@srv&password=pw&useSSL=true',
      {
        database: 'db',
        host: 'srv.mysql.database.azure.com',
        options: 'usessl=true',
        password: 'pw',
        port: '3306',
        type: ConnectionType.MySQL,
        user: 'admin@srv',
      },
    ],
    [
      'jdbc:clickhouse://ch.acme.io:8123/logs',
      {
        database: 'logs',
        host: 'ch.acme.io',
        port: '8123',
        type: ConnectionType.ClickHouse,
      },
    ],
    [
      'jdbc:sqlserver://mssql.acme.io:1433;databaseName=db;user=sa;password={p;w};encrypt=true;trustServerCertificate=false;loginTimeout=30',
      {
        database: 'db',
        host: 'mssql.acme.io',
        options: 'encrypt=true&trustservercertificate=false',
        password: 'p;w',
        port: '1433',
        type: ConnectionType.MSSQL,
        user: 'sa',
      },
    ],
    [
      'jdbc:oracle:thin:@//db.acme.io:1521/ORCLPDB1',
      {
        database: 'ORCLPDB1',
        host: 'db.acme.io',
        port: '1521',
        type: ConnectionType.Oracle,
      },
    ],
    [
      'jdbc:oracle:thin:@db.acme.io:1522:ORCL',
      {
        database: 'ORCL',
        host: 'db.acme.io',
        port: '1522',
        type: ConnectionType.Oracle,
      },
    ],
    [
      'spring.datasource.url=jdbc:oracle:thin:scott/tiger@db.acme.io:1521/FREEPDB1',
      {
        database: 'FREEPDB1',
        host: 'db.acme.io',
        password: 'tiger',
        port: '1521',
        type: ConnectionType.Oracle,
        user: 'scott',
      },
    ],
  ])('reads %s', (text, parts) => {
    const guess = guessConnection(text)
    expect(guess?.format).toBe('jdbc')
    expect(guess?.parts).toStrictEqual(parts)
  })
})
