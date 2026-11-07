import { describe, expect, it } from 'bun:test'

import { ConnectionType, Provider } from '@tamery/shared/enums/connection-type'

import { guessConnection } from './index'

describe('guessConnection — unrecognised input', () => {
  it.each([
    [''],
    ['   '],
    ['p'],
    ['postgres:'],
    ['postgres://'],
    ['hello world'],
    ['{ "a": 1 }'],
    ['{ "broken": '],
    ['postgres://me@db.acme.io:99999/app'],
    ['v1.2.3'],
    ['/Users/me/notes.txt'],
    ['file:./dev.db'],
  ])('returns null for %p', (text) => {
    expect(guessConnection(text)).toBeNull()
  })
})

describe('guessConnection — snippets from configs and tools', () => {
  it.each([
    [
      'spring.datasource.url=jdbc:postgresql://localhost:5432/app\nspring.datasource.username=me\nspring.datasource.password=pw',
      { database: 'app', host: 'localhost', password: 'pw', user: 'me' },
    ],
    [
      'DATABASE_URL=postgres://me@db.acme.io:5432/app\nDB_PASSWORD=pw',
      { host: 'db.acme.io', password: 'pw', user: 'me' },
    ],
    [
      'host = db.acme.io port = 5433 dbname = app user = me',
      { database: 'app', host: 'db.acme.io', port: '5433', user: 'me' },
    ],
    [
      "DATABASES = {\n  'default': {\n    'ENGINE': 'django.db.backends.postgresql',\n    'NAME': 'app',\n    'USER': 'me',\n    'PASSWORD': 'pw',\n    'HOST': 'db.acme.io',\n  }\n}",
      {
        database: 'app',
        host: 'db.acme.io',
        type: ConnectionType.Postgres,
        user: 'me',
      },
    ],
    [
      'services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: pw\n    ports:\n      - "5433:5432"',
      {
        host: 'localhost',
        password: 'pw',
        port: '5433',
        type: ConnectionType.Postgres,
      },
    ],
    [
      'endpoint = "app.abc.us-east-1.rds.amazonaws.com:5432"\nusername = "me"\npassword = "pw"',
      { host: 'app.abc.us-east-1.rds.amazonaws.com', port: '5432', user: 'me' },
    ],
    [
      'DSN=me:pw@tcp(db.acme.io:3306)/app?parseTime=true',
      {
        database: 'app',
        host: 'db.acme.io',
        password: 'pw',
        type: ConnectionType.MySQL,
      },
    ],
    [
      'db.acme.io:5432:app:me:pw',
      {
        database: 'app',
        host: 'db.acme.io',
        type: ConnectionType.Postgres,
        user: 'me',
      },
    ],
    [
      'Driver={ODBC Driver 18 for SQL Server};Server=tcp:db.acme.io,1433;Database=app;Uid=me;Pwd=pw;',
      {
        host: 'db.acme.io',
        port: '1433',
        type: ConnectionType.MSSQL,
        user: 'me',
      },
    ],
    [
      'Server=.;Database=app;User Id=sa;Password=pw;TrustServerCertificate=True',
      { host: 'localhost', type: ConnectionType.MSSQL },
    ],
    ['jdbc:ch://ch.acme.io:8123/default', { type: ConnectionType.ClickHouse }],
    [
      'cockroachdb://root@crdb.acme.io:26257/defaultdb',
      { type: ConnectionType.Postgres },
    ],
    [
      'pg_dump -h db.acme.io -U me -p 5433 app > dump.sql',
      { database: 'app', host: 'db.acme.io', port: '5433', user: 'me' },
    ],
    [
      '/Users/me/My Data/app.sqlite3',
      {
        database: '/Users/me/My Data/app.sqlite3',
        type: ConnectionType.SQLite,
      },
    ],
    [
      'jdbc:sqlite:/srv/app%20data.db',
      { database: '/srv/app data.db', type: ConnectionType.SQLite },
    ],
    [
      'sqlite3 "C:\\data\\app.db"',
      { database: 'C:\\data\\app.db', type: ConnectionType.SQLite },
    ],
    [
      'DATABASE_URL=sqlite:////var/lib/app.db',
      { database: '/var/lib/app.db', type: ConnectionType.SQLite },
    ],
    [
      'sqlite:////var/lib/app.db',
      { database: '/var/lib/app.db', type: ConnectionType.SQLite },
    ],
    [
      'file:/srv/app.db?mode=ro&cache=shared',
      { database: '/srv/app.db', type: ConnectionType.SQLite },
    ],
    [
      'jdbc:sqlite:file:/srv/app.db',
      { database: '/srv/app.db', type: ConnectionType.SQLite },
    ],
    [
      '~/data/app.db',
      { database: '~/data/app.db', type: ConnectionType.SQLite },
    ],
    [
      '/Users/me/sales.duckdb',
      { database: '/Users/me/sales.duckdb', type: ConnectionType.DuckDB },
    ],
    [
      'duckdb ~/data/events.ddb',
      { database: '~/data/events.ddb', type: ConnectionType.DuckDB },
    ],
    [
      'jdbc:duckdb:/srv/warehouse.db',
      { database: '/srv/warehouse.db', type: ConnectionType.DuckDB },
    ],
    [
      'md:analytics?motherduck_token=eyJhbGciOi.eyJpYXQi',
      {
        database: 'analytics',
        host: 'pg.us-east-1-aws.motherduck.com',
        password: 'eyJhbGciOi.eyJpYXQi',
        provider: Provider.MotherDuck,
        type: ConnectionType.DuckDB,
      },
    ],
    [
      'postgresql://postgres:tok@pg.eu-central-1-aws.motherduck.com:5432/md:?sslmode=verify-full',
      {
        host: 'pg.eu-central-1-aws.motherduck.com',
        password: 'tok',
        provider: Provider.MotherDuck,
        type: ConnectionType.DuckDB,
      },
    ],
    [
      'MOTHERDUCK_TOKEN=eyJhbGciOi.eyJpYXQi',
      {
        host: 'pg.us-east-1-aws.motherduck.com',
        password: 'eyJhbGciOi.eyJpYXQi',
        provider: Provider.MotherDuck,
      },
    ],
    [
      'libsql://shop-acme.aws-eu-west-1.turso.io?authToken=eyJhbGciOi.eyJpYXQi.sig_part-1',
      {
        host: 'shop-acme.aws-eu-west-1.turso.io',
        password: 'eyJhbGciOi.eyJpYXQi.sig_part-1',
        type: ConnectionType.SQLite,
      },
    ],
    [
      'TURSO_DATABASE_URL=https://shop-acme.turso.io\nTURSO_AUTH_TOKEN=eyJhbGciOi.eyJpYXQi.sig_part-1',
      {
        host: 'shop-acme.turso.io',
        password: 'eyJhbGciOi.eyJpYXQi.sig_part-1',
        type: ConnectionType.SQLite,
      },
    ],
    [
      'https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/workers/d1/databases/e179f207-0000-45ea-830c-4efd8618ae6e/metrics',
      {
        database: 'e179f207-0000-45ea-830c-4efd8618ae6e',
        host: 'api.cloudflare.com',
        type: ConnectionType.SQLite,
        user: '0123456789abcdef0123456789abcdef',
      },
    ],
    [
      'CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef\nCLOUDFLARE_DATABASE_ID=e179f207-0000-45ea-830c-4efd8618ae6e\nCLOUDFLARE_D1_TOKEN=abcdefghijABCDEFGHIJ0123456789_-abcdefgh',
      {
        database: 'e179f207-0000-45ea-830c-4efd8618ae6e',
        host: 'api.cloudflare.com',
        password: 'abcdefghijABCDEFGHIJ0123456789_-abcdefgh',
        type: ConnectionType.SQLite,
        user: '0123456789abcdef0123456789abcdef',
      },
    ],
    [
      '[[d1_databases]]\nbinding = "DB"\ndatabase_name = "shop"\ndatabase_id = "e179f207-0000-45ea-830c-4efd8618ae6e"',
      {
        database: 'e179f207-0000-45ea-830c-4efd8618ae6e',
        host: 'api.cloudflare.com',
        type: ConnectionType.SQLite,
      },
    ],
    [
      'curl https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/d1/database/e179f207-0000-45ea-830c-4efd8618ae6e/raw',
      {
        database: 'e179f207-0000-45ea-830c-4efd8618ae6e',
        type: ConnectionType.SQLite,
        user: '0123456789abcdef0123456789abcdef',
      },
    ],
    [
      'wss://shop-acme.turso.io',
      { host: 'shop-acme.turso.io', type: ConnectionType.SQLite },
    ],
    [
      'libsql://localhost:8080?tls=0',
      {
        host: 'localhost',
        options: 'tls=0',
        port: '8080',
        type: ConnectionType.SQLite,
      },
    ],
    [
      'TURSO_DATABASE_URL=libsql://shop-acme.turso.io\nTURSO_AUTH_TOKEN=eyJhbGciOi.eyJpYXQi.sig_part-1',
      {
        host: 'shop-acme.turso.io',
        password: 'eyJhbGciOi.eyJpYXQi.sig_part-1',
        type: ConnectionType.SQLite,
      },
    ],
  ])('reads %p', (text, parts) => {
    expect(guessConnection(text)?.parts).toMatchObject(parts)
  })

  it.each([
    'DATABASE_URL=postgres://app:secret@db.example.com/shop\nDATABASE_ID=e179f207-0000-45ea-830c-4efd8618ae6e',
    '{"url": "postgres://app:secret@db.example.com/shop", "database_id": "e179f207-0000-45ea-830c-4efd8618ae6e"}',
    'postgres://app:secret@db.example.com/shop?redirect=https://shop-acme.turso.io',
  ])('keeps %p a Postgres connection', (text) => {
    expect(guessConnection(text)?.parts).toMatchObject({
      host: 'db.example.com',
      type: ConnectionType.Postgres,
    })
  })
})
