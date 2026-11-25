import { describe, expect, it } from 'bun:test'

import { SafeURL } from './safe-url'

const errorMessage = () => {
  try {
    // oxlint-disable-next-line no-new
    new SafeURL('not-a-valid-connection-string')
  } catch (error) {
    return (error as Error).message
  }
}

const RANDOM_URLS = [
  'http://localhost:5432/mydb',
  'postgresql://user:pass@localhost:5432/mydb',
  'mysql://root:secret@127.0.0.1:3306/testdb',
  'mssql://sa:password@sqlserver.example.com:1433/production',
  'mongodb://mongoUser:mongoPass@mongo.example.com:27017/my-mongo-db',
  'oracle://oracleUser:oraclePass@oraclehost:1521/ORCLPDB1',
  'redis://:redispass@redis.example.com:6379/0',
  'cassandra://cassandraUser:cassandraPass@cassandra.example.com:9042/keyspace1',
  'cockroachdb://roach:roachpass@roach.example.com:26257/roachdb?sslmode=disable',
  'db2://db2inst1:db2pass@db2host:50000/SAMPLE',
]

describe('new SafeURL', () => {
  it('parses a standard Postgres connection string', () => {
    const conn = 'postgresql://user:pass@localhost:5432/mydb'
    const parsed = new SafeURL(conn)

    expect(parsed).toMatchObject({
      hash: '',
      host: 'localhost:5432',
      hostname: 'localhost',
      href: conn,
      origin: 'postgresql://localhost:5432',
      password: 'pass',
      pathname: '/mydb',
      port: '5432',
      protocol: 'postgresql:',
      search: '',
      username: 'user',
    })
    expect([...parsed.searchParams.entries()]).toEqual([])
  })

  it('accepts a SafeURL instance', () => {
    const original = new SafeURL(
      'postgresql://user:pass@localhost:5432/mydb?sslmode=require'
    )
    const parsed = new SafeURL(original)

    expect(parsed).toMatchObject({
      hash: '',
      host: 'localhost:5432',
      hostname: 'localhost',
      href: 'postgresql://user:pass@localhost:5432/mydb?sslmode=require',
      origin: 'postgresql://localhost:5432',
      password: 'pass',
      pathname: '/mydb',
      port: '5432',
      protocol: 'postgresql:',
      search: '?sslmode=require',
      username: 'user',
    })
    expect([...parsed.searchParams.entries()]).toEqual([['sslmode', 'require']])
  })

  it('parses a connection string with query parameters', () => {
    const conn =
      'postgresql://user:pass@localhost:5432/mydb?sslmode=require&application_name=myapp'
    const parsed = new SafeURL(conn)

    expect(parsed).toMatchObject({
      hash: '',
      host: 'localhost:5432',
      hostname: 'localhost',
      href: conn,
      origin: 'postgresql://localhost:5432',
      password: 'pass',
      pathname: '/mydb',
      port: '5432',
      protocol: 'postgresql:',
      search: '?sslmode=require&application_name=myapp',
      username: 'user',
    })
    expect([...parsed.searchParams.entries()]).toEqual([
      ['sslmode', 'require'],
      ['application_name', 'myapp'],
    ])
  })

  it('parses a connection string with empty database and options', () => {
    const conn = 'postgresql://user:pass@localhost:5432/'
    const parsed = new SafeURL(conn)

    expect(parsed).toMatchObject({
      hash: '',
      host: 'localhost:5432',
      hostname: 'localhost',
      href: conn,
      origin: 'postgresql://localhost:5432',
      password: 'pass',
      pathname: '/',
      port: '5432',
      protocol: 'postgresql:',
      search: '',
      username: 'user',
    })
    expect([...parsed.searchParams.entries()]).toEqual([])
    expect(parsed.toString()).toBe(conn)
  })

  it('parses a connection string with empty path and set later', () => {
    const conn = 'postgresql://user:pass@localhost:5432'
    const parsed = new SafeURL(conn)
    parsed.pathname = 'mydb'

    expect(parsed).toMatchObject({
      hash: '',
      host: 'localhost:5432',
      hostname: 'localhost',
      href: `${conn}/mydb`,
      origin: 'postgresql://localhost:5432',
      password: 'pass',
      pathname: '/mydb',
      port: '5432',
      protocol: 'postgresql:',
      search: '',
      username: 'user',
    })
    expect([...parsed.searchParams.entries()]).toEqual([])
  })

  it('parses a connection string with special characters in username and password', () => {
    const conn = 'postgresql://us%40er:pa%3A#ss@localhost:5432/mydb'
    const parsed = new SafeURL(conn)

    expect(parsed).toMatchObject({
      hash: '',
      host: 'localhost:5432',
      hostname: 'localhost',
      href: conn,
      origin: 'postgresql://localhost:5432',
      password: 'pa%3A#ss',
      pathname: '/mydb',
      port: '5432',
      protocol: 'postgresql:',
      search: '',
      username: 'us%40er',
    })
    expect([...parsed.searchParams.entries()]).toEqual([])
  })

  it('parses a connection string with multiple query parameters', () => {
    const conn =
      'postgresql://user:pass@localhost:5432/mydb?ssl=true&connect_timeout=10&search_path=myschema'
    const parsed = new SafeURL(conn)

    expect(parsed).toMatchObject({
      hash: '',
      host: 'localhost:5432',
      hostname: 'localhost',
      href: conn,
      origin: 'postgresql://localhost:5432',
      password: 'pass',
      pathname: '/mydb',
      port: '5432',
      protocol: 'postgresql:',
      search: '?ssl=true&connect_timeout=10&search_path=myschema',
      username: 'user',
    })
    expect([...parsed.searchParams.entries()]).toEqual([
      ['ssl', 'true'],
      ['connect_timeout', '10'],
      ['search_path', 'myschema'],
    ])
  })

  it.each([
    [
      'postgresql://srv.postgres.database.azure.com:5432/db?user=admin@srv&password=pw&sslmode=require',
      {
        hostname: 'srv.postgres.database.azure.com',
        password: '',
        username: '',
      },
    ],
    [
      'mysql://srv.mysql.database.azure.com:3306/db?user=admin@srv&password=pw',
      { hostname: 'srv.mysql.database.azure.com', password: '', username: '' },
    ],
    [
      'postgresql://u:p@host/db?user=admin@srv',
      { hostname: 'host', password: 'p', username: 'u' },
    ],
    [
      'postgresql://u:a/b?c@d@host/db?user=admin@srv',
      { hostname: 'host', password: 'a/b?c@d', username: 'u' },
    ],
    [
      'postgresql://u:pa?ss@host/db',
      { hostname: 'host', password: 'pa?ss', username: 'u' },
    ],
    [
      'postgres://u:123/x?k=v@host/db',
      { hostname: 'host', password: '123/x?k=v', username: 'u' },
    ],
    [
      "mongodb://u$$s$&r:pa$$w$&r$'d@host/db",
      { hostname: 'host', password: "pa$$w$&r$'d", username: 'u$$s$&r' },
    ],
  ])('splits the credentials of %s before its query', (conn, expected) => {
    const parsed = new SafeURL(conn)

    expect(parsed).toMatchObject(expected)
    expect(parsed.href).toBe(conn)
  })

  it('throws on invalid connection string', () => {
    expect(() => new SafeURL('not-a-valid-connection-string')).toThrow(
      errorMessage()
    )
  })

  it('parses a connection string with empty credentials', () => {
    const conn = 'postgresql://:@localhost:5432/mydb'
    const parsed = new SafeURL(conn)

    expect(parsed.protocol).toBe('postgresql:')
    expect(parsed.origin).toBe('postgresql://localhost:5432')
    expect(parsed.host).toBe('localhost:5432')
    expect(parsed.username).toBe('')
    expect(parsed.password).toBe('')
    expect(parsed.hostname).toBe('localhost')
    expect(parsed.port).toBe('5432')
    expect(parsed.pathname).toBe('/mydb')
    expect(parsed.search).toBe('')
    expect(parsed.hash).toBe('')
    expect(parsed.href).toBe(conn.replace(':@', ''))
    expect([...parsed.searchParams.entries()]).toEqual([])
  })

  it('parses a connection string with empty path - with trailing slash', () => {
    const conn = 'postgresql://user:pass@localhost:5432/'
    const parsed = new SafeURL(conn)

    expect(parsed.protocol).toBe('postgresql:')
    expect(parsed.origin).toBe('postgresql://localhost:5432')
    expect(parsed.host).toBe('localhost:5432')
    expect(parsed.username).toBe('user')
    expect(parsed.password).toBe('pass')
    expect(parsed.hostname).toBe('localhost')
    expect(parsed.port).toBe('5432')
    expect(parsed.pathname).toBe('/')
    expect(parsed.search).toBe('')
    expect(parsed.hash).toBe('')
    expect(parsed.href).toBe(conn)
    expect([...parsed.searchParams.entries()]).toEqual([])
  })

  it('parses a connection string with empty path - without trailing slash', () => {
    const conn = 'postgresql://user:pass@localhost:5432'
    const parsed = new SafeURL(conn)

    expect(parsed.protocol).toBe('postgresql:')
    expect(parsed.origin).toBe('postgresql://localhost:5432')
    expect(parsed.host).toBe('localhost:5432')
    expect(parsed.username).toBe('user')
    expect(parsed.password).toBe('pass')
    expect(parsed.hostname).toBe('localhost')
    expect(parsed.port).toBe('5432')
    expect(parsed.pathname).toBe('')
    expect(parsed.search).toBe('')
    expect(parsed.hash).toBe('')
    expect(parsed.href).toBe(conn)
    expect([...parsed.searchParams.entries()]).toEqual([])
  })

  describe('property setting', () => {
    it('should allow setting username and password properties', () => {
      const conn = 'postgresql://user:pass@localhost:5432/mydb'
      const parsed = new SafeURL(conn)

      parsed.username = 'newuser'
      parsed.password = 'newpass'

      expect(parsed.username).toBe('newuser')
      expect(parsed.password).toBe('newpass')
      expect(parsed.href).toBe(
        'postgresql://newuser:newpass@localhost:5432/mydb'
      )
    })

    it('should handle setting empty credentials', () => {
      const conn = 'postgresql://user:pass@localhost:5432/mydb'
      const parsed = new SafeURL(conn)

      parsed.username = ''
      parsed.password = ''

      expect(parsed.username).toBe('')
      expect(parsed.password).toBe('')
      expect(parsed.href).toBe('postgresql://localhost:5432/mydb')
    })

    it('should handle setting special characters in credentials', () => {
      const conn = 'postgresql://user:pass@localhost:5432/mydb'
      const parsed = new SafeURL(conn)

      parsed.username = 'user@domain'
      parsed.password = 'pass:word'

      expect(parsed.username).toBe('user@domain')
      expect(parsed.password).toBe('pass:word')
      expect(parsed.href).toBe(
        'postgresql://user@domain:pass:word@localhost:5432/mydb'
      )
    })

    it('should maintain other properties when setting credentials', () => {
      const conn = 'postgresql://user:pass@localhost:5432/mydb?ssl=true#section'
      const parsed = new SafeURL(conn)

      parsed.username = 'newuser'
      parsed.password = 'newpass'

      expect(parsed).toMatchObject({
        hash: '#section',
        host: 'localhost:5432',
        hostname: 'localhost',
        href: conn.replace('user:pass', 'newuser:newpass'),
        origin: 'postgresql://localhost:5432',
        password: 'newpass',
        pathname: '/mydb',
        port: '5432',
        protocol: 'postgresql:',
        search: '?ssl=true',
        username: 'newuser',
      })
    })

    it('should allow setting other properties and reflect in href', () => {
      const conn = 'postgresql://user:pass@localhost:5432/mydb?ssl=true#section'
      const parsed = new SafeURL(conn)

      parsed.username = 'alice'
      parsed.password = 'wonderland'
      parsed.protocol = 'mysql:'
      parsed.hostname = 'db.example.com'
      parsed.port = '3306'
      parsed.pathname = '/testdb'
      parsed.search = '?foo=bar&baz=qux'
      parsed.hash = '#top'

      expect(parsed.protocol).toBe('mysql:')
      expect(parsed.hostname).toBe('db.example.com')
      expect(parsed.port).toBe('3306')
      expect(parsed.pathname).toBe('/testdb')
      expect(parsed.search).toBe('?foo=bar&baz=qux')
      expect(parsed.hash).toBe('#top')
      expect(parsed.username).toBe('alice')
      expect(parsed.password).toBe('wonderland')
      expect(parsed.href).toBe(
        'mysql://alice:wonderland@db.example.com:3306/testdb?foo=bar&baz=qux#top'
      )
    })
  })

  it('parses a random database URL', () => {
    for (const url of RANDOM_URLS) {
      expect(() => new SafeURL(url)).not.toThrow()
      const parsed = new SafeURL(url)
      expect(parsed.href).toBe(url)
      expect(typeof parsed.protocol).toBe('string')
      expect(typeof parsed.hostname).toBe('string')
      expect(typeof parsed.host).toBe('string')
      expect(typeof parsed.origin).toBe('string')
      expect(typeof parsed.username).toBe('string')
      expect(typeof parsed.password).toBe('string')
      expect(typeof parsed.pathname).toBe('string')
      expect(typeof parsed.search).toBe('string')
      expect(typeof parsed.hash).toBe('string')
      expect(Array.isArray([...parsed.searchParams.entries()])).toBe(true)
    }
  })
})
