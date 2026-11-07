import { describe, expect, test } from 'bun:test'

import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

import { connectionParts } from './connection-parts'
import { databaseFile } from './database-file'
import { describeConnectionString, resourceConnectionString } from './utils'

describe('databaseFile', () => {
  test.each([
    '/Users/me/app data.db',
    '/tmp/a#b?c%d.sqlite',
    'C:/Users/me/app.db',
    '~/data/app.db',
  ])('reads %p back from its string', (path) => {
    expect(
      databaseFile.path(
        databaseFile.connectionString(ConnectionType.SQLite, path)
      )
    ).toBe(path)
  })

  test('takes a Windows path with backslashes', () => {
    expect(
      databaseFile.path(
        databaseFile.connectionString(
          ConnectionType.SQLite,
          String.raw`C:\data\app.db`
        )
      )
    ).toBe('C:/data/app.db')
  })

  test('drops the spaces a copied path carries', () => {
    expect(
      databaseFile.path(
        databaseFile.connectionString(ConnectionType.SQLite, ' /srv/app.db \n')
      )
    ).toBe('/srv/app.db')
  })

  test('round-trips through the form parts', () => {
    const connectionString = databaseFile.connectionString(
      ConnectionType.SQLite,
      '/srv/app.db'
    )
    const parts = connectionParts.parse(connectionString)

    expect(parts).toMatchObject({
      database: '/srv/app.db',
      host: '',
      type: ConnectionType.SQLite,
    })
    expect(connectionParts.format(parts)).toBe(connectionString)
  })

  test('keeps its string for the resource and shows the file name', () => {
    const connectionString = databaseFile.connectionString(
      ConnectionType.SQLite,
      '/srv/app.db'
    )

    expect(resourceConnectionString(connectionString, 'main')).toBe(
      connectionString
    )
    expect(describeConnectionString(connectionString)).toMatchObject({
      defaultResourceName: 'main',
      displayUrl: 'app.db',
      isInternal: true,
    })
  })
})

describe('a DuckDB file', () => {
  test('round-trips through the form parts', () => {
    const connectionString = databaseFile.connectionString(
      ConnectionType.DuckDB,
      '/srv/sales data.duckdb'
    )

    expect(connectionParts.parse(connectionString)).toMatchObject({
      database: '/srv/sales data.duckdb',
      host: '',
      provider: null,
      type: ConnectionType.DuckDB,
    })
    expect(
      connectionParts.format(connectionParts.parse(connectionString))
    ).toBe(connectionString)
  })

  test('names its resource after the file, up to its first dot', () => {
    const connectionString = databaseFile.connectionString(
      ConnectionType.DuckDB,
      '/srv/sales.2024.duckdb'
    )

    expect(resourceConnectionString(connectionString, 'sales')).toBe(
      connectionString
    )
    expect(describeConnectionString(connectionString)).toMatchObject({
      defaultResourceName: 'sales',
      displayUrl: 'sales.2024.duckdb',
    })
  })
})

describe('a MotherDuck string', () => {
  const connectionString =
    'motherduck://:token@pg.us-east-1-aws.motherduck.com/analytics'

  test('keeps its token as the password and its database in the path', () => {
    expect(connectionParts.parse(connectionString)).toMatchObject({
      database: 'analytics',
      host: 'pg.us-east-1-aws.motherduck.com',
      password: 'token',
      provider: Provider.MotherDuck,
      type: ConnectionType.DuckDB,
    })
    expect(
      connectionParts.format(connectionParts.parse(connectionString))
    ).toBe(connectionString)
  })

  test('opens another database through the path', () => {
    expect(resourceConnectionString(connectionString, 'my_db')).toBe(
      'motherduck://:token@pg.us-east-1-aws.motherduck.com/my_db'
    )
    expect(
      describeConnectionString(
        'motherduck://:token@pg.us-east-1-aws.motherduck.com'
      ).defaultResourceName
    ).toBe('my_db')
  })
})
