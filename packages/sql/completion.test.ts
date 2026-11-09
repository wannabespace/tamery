import { describe, expect, it } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'

import type { SqlCatalog } from './catalog'
import { completionItems } from './completion'
import { completionContext } from './completion-context'
import { dialects } from './dialects'

const pg = dialects[Dialect.Postgres]
const catalog: SqlCatalog = {
  defaultSchema: 'public',
  enums: [{ name: 'status', values: ['active', 'banned'] }],
  nameCase: null,
  schemas: [
    {
      name: 'public',
      tables: [
        {
          columns: [
            { name: 'id', nullable: false, type: 'int' },
            { name: 'email', nullable: true, type: 'text' },
            { name: 'status', nullable: false, type: 'status' },
            { name: 'active', nullable: false, type: 'boolean' },
          ],
          kind: 'table',
          name: 'users',
        },
        {
          columns: [
            { name: 'id', nullable: false, type: 'int' },
            { name: 'user_id', nullable: false, type: 'int' },
            { name: 'title', nullable: false, type: 'text' },
          ],
          kind: 'table',
          name: 'posts',
        },
      ],
    },
    { name: 'audit', tables: [{ columns: [], kind: 'view', name: 'log' }] },
  ],
}
const complete = (sql: string, offset = sql.length) => {
  const context = completionContext(sql, offset, pg)
  const items = completionItems(context, catalog, pg)
  return {
    context,
    inserts: items.map((item) => item.insertText),
    labels: items.map((item) => item.label),
  }
}

describe('completion', () => {
  it('offers tables after FROM and columns after an alias dot', () => {
    const fromCase = complete('SELECT * FROM ')
    expect(fromCase.context.expects).toBe('table')
    expect(fromCase.labels.slice(0, 3)).toEqual(['users', 'posts', 'audit.log'])

    const dot = complete('SELECT u. FROM users u', 9)
    expect(dot.context.qualifier).toEqual(['u'])
    expect(dot.labels).toEqual(['id', 'email', 'status', 'active'])

    expect(complete('SELECT * FROM audit.', 20).labels).toEqual(['log'])
  })

  it('offers scope columns and functions in expressions', () => {
    const { context, labels } = complete('SELECT  FROM users', 7)
    expect(context.expects).toBe('column')
    expect(labels.slice(0, 3)).toEqual(['*', 'id, email, status, active', 'id'])
    expect(labels).toContain('COUNT')
  })

  it('qualifies columns once several tables are in scope', () => {
    const { labels } = complete(
      'SELECT  FROM users u JOIN posts p ON p.user_id = u.id',
      7
    )
    expect(labels).toContain('u.email')
    expect(labels).toContain('p.title')
    expect(labels).not.toContain('email')
  })

  it('offers the next clause after a finished term', () => {
    expect(complete('SELECT id FROM users ').labels.slice(0, 2)).toEqual([
      'WHERE',
      'JOIN',
    ])
    expect(complete('SELECT id FROM users u JOIN posts p ').labels).toEqual([
      'ON',
      'AS',
    ])
    expect(complete('SELECT * FROM users WHERE id = 1 ').labels[0]).toBe('AND')
    expect(complete('SELECT * ').labels).toEqual(['FROM', 'AS'])
    expect(complete('SELECT id FROM users wh', 23).labels).toContain('WHERE')
  })

  it('offers operators for a column awaiting its comparison, typed by the column', () => {
    expect(
      complete('SELECT * FROM users WHERE id ').labels.slice(0, 2)
    ).toEqual(['=', '<>'])
    expect(
      complete('SELECT * FROM users WHERE active ').labels.slice(0, 2)
    ).toEqual(['= TRUE', '= FALSE'])
    expect(
      complete('SELECT * FROM users WHERE email ').labels.slice(0, 5)
    ).toEqual(['=', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL'])
  })

  it('offers the values a column takes after its comparison', () => {
    const { inserts } = complete('SELECT * FROM users WHERE status = ')
    expect(inserts.slice(0, 2)).toEqual(["'active'", "'banned'"])
    expect(
      complete('SELECT * FROM users u WHERE u.active = ').labels.slice(0, 2)
    ).toEqual(['TRUE', 'FALSE'])
    expect(complete('SELECT * FROM users WHERE status IN (').inserts[0]).toBe(
      "'active'"
    )
  })

  it('offers enum values inside the quotes, replacing only what they hold', () => {
    const empty = complete("SELECT * FROM users WHERE status = ''", 36)
    expect(empty.inserts).toEqual(['active', 'banned'])
    const typed = complete("SELECT * FROM users u WHERE u.status = 'ba'", 42)
    expect(typed.context.prefix).toBe('ba')
    expect([typed.context.replaceStart, typed.context.replaceEnd]).toEqual([
      40, 42,
    ])
    expect(
      complete("SELECT * FROM users WHERE status = 'ac").context.replaceEnd
    ).toBe(38)
  })

  it('guesses join conditions from column names', () => {
    expect(complete('SELECT * FROM users u JOIN posts p ON ').labels[0]).toBe(
      'p.user_id = u.id'
    )
  })

  it('repeats the selected columns after GROUP BY', () => {
    expect(
      complete(
        'SELECT email, status, count(*) FROM users GROUP BY '
      ).labels.slice(0, 3)
    ).toEqual(['email, status', 'email', 'status'])
  })

  it('templates an INSERT after its table, and numbers after LIMIT', () => {
    const into = complete('INSERT INTO posts ')
    expect(into.labels[0]).toBe('(columns…) VALUES (…)')
    expect(into.inserts[0]).toBe(
      `(user_id, title)\nVALUES (\${1:user_id}, \${2:title})`
    )
    expect(complete('SELECT * FROM users LIMIT ').labels).toEqual([
      '10',
      '50',
      '100',
      '1000',
    ])
  })

  it('follows the casing the user writes keywords in', () => {
    expect(complete('select id from users ').inserts.slice(0, 2)).toEqual([
      'where',
      'join',
    ])
    expect(complete('select id from users wh', 23).inserts).toContain('where')
    expect(complete('SELECT id FROM users ').inserts[0]).toBe('WHERE')
  })

  it('offers statement verbs, not tables, at the start of a statement', () => {
    const start = complete('s')
    expect(start.context.expects).toBe('statement')
    expect(start.labels[0]).toBe('SELECT')
    expect(start.labels).not.toContain('users')
    expect(complete('SELECT 1;\nup').labels).toContain('UPDATE')
  })

  it('stays quiet inside strings and comments', () => {
    expect(complete("SELECT * FROM users WHERE name = 'ab", 36).labels).toEqual(
      []
    )
    expect(complete('-- sel', 6).labels).toEqual([])
    expect(complete('-- header\nSELECT 1', 5).labels).toEqual([])
  })

  it('quotes the names Postgres would fold', () => {
    const exact: SqlCatalog = {
      defaultSchema: 'public',
      enums: [],
      nameCase: 'lower',
      schemas: [
        {
          name: 'public',
          tables: [
            {
              columns: [
                { name: 'id', nullable: false, type: 'int' },
                { name: 'userId', nullable: false, type: 'int' },
              ],
              kind: 'table',
              name: 'User',
            },
          ],
        },
      ],
    }
    const inserts = (sql: string, offset = sql.length) =>
      completionItems(completionContext(sql, offset, pg), exact, pg).map(
        (item) => item.insertText
      )
    expect(inserts('SELECT * FROM ')).toContain('"User"')
    expect(inserts('SELECT "User". FROM "User"', 14)).toEqual([
      'id',
      '"userId"',
    ])
  })

  it('offers only the vocabulary the dialect speaks', () => {
    const mssql = dialects[Dialect.MSSQL]
    const labels = (sql: string) =>
      completionItems(
        completionContext(sql, sql.length, mssql),
        catalog,
        mssql
      ).map((item) => item.label)
    expect(labels('SELECT * FROM users ')).not.toContain('LIMIT')
    expect(labels('SELECT ')).not.toContain('NOW')
    expect(complete('SELECT * FROM users ').labels).toContain('LIMIT')
  })

  it('offers the columns a derived table or CTE selects, under its own name', () => {
    expect(
      complete('SELECT * FROM (SELECT id, email FROM users) sq WHERE sq.')
        .labels
    ).toEqual(['id', 'email'])
    expect(
      complete(
        'WITH sq AS (SELECT u.id, u.email AS mail, count(*) n FROM users u) SELECT sq. FROM sq',
        77
      ).labels
    ).toEqual(['id', 'mail', 'n'])
    expect(
      complete(
        'WITH sq(a, b) AS (SELECT id, email FROM users) SELECT sq. FROM sq',
        57
      ).labels
    ).toEqual(['a', 'b'])
    expect(
      complete(
        'WITH sq AS (SELECT * FROM users) SELECT * FROM sq WHERE status = '
      ).inserts[0]
    ).toBe("'active'")
  })

  it('lets a lateral subquery shadow the table it is named after', () => {
    const sql =
      'SELECT "posts". FROM "users" "d0" LEFT JOIN LATERAL (SELECT json_agg("t".*) AS "r" FROM (SELECT * FROM "posts" "d1" WHERE "d1"."user_id" = "d0"."id") "t") AS "posts" ON true'
    expect(complete(sql, 15).labels).toEqual(['r'])
  })

  it('scopes columns to the query the caret is in', () => {
    expect(
      complete('SELECT id FROM users UNION ALL SELECT  FROM posts', 38).labels
    ).not.toContain('email')
    expect(
      complete(
        'SELECT *, (SELECT count(*) FROM posts p WHERE p.user_id = users.id) FROM users WHERE '
      ).labels
    ).not.toContain('title')
    const correlated = complete(
      'SELECT * FROM users WHERE id IN (SELECT  FROM posts)',
      40
    ).labels
    expect(correlated).toContain('title')
    expect(correlated).toContain('users.email')
  })

  it("offers the written table's columns where a statement names them", () => {
    const columns = ['id', 'email', 'status', 'active']
    expect(complete('INSERT INTO users (').labels).toEqual(columns)
    expect(complete('UPDATE users SET ').labels).toEqual(columns)
    expect(
      complete('INSERT INTO users (id) VALUES (1) ON CONFLICT (').labels
    ).toEqual(columns)
    expect(
      complete(
        'INSERT INTO users (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET email = excluded.'
      ).labels
    ).toEqual(columns)
  })

  it.each([
    ['SELECT * FROM users u JOIN posts p ON p.user_id = u.id ', 'AND'],
    ['SELECT * FROM users WHERE (id = 1 OR id = 2) ', 'AND'],
    ['SELECT * FROM users WHERE id IN (SELECT user_id FROM posts) ', 'AND'],
    ['SELECT * FROM users WHERE email IS NOT NULL ', 'AND'],
    ['SELECT * FROM users WHERE id BETWEEN 1 ', 'AND'],
    ['SELECT * FROM users WHERE id BETWEEN 1 AND 5 ', 'AND'],
    ['SELECT * FROM users WHERE email IS ', 'NULL'],
    ['SELECT * FROM users WHERE id NOT ', 'IN ('],
    ['SELECT status FROM users GROUP BY status ', 'HAVING'],
    ['SELECT * FROM users ORDER BY id ', 'ASC'],
    ['SELECT * FROM users ORDER BY id DESC ', 'NULLS FIRST'],
    ['SELECT * FROM users LIMIT 10 ', 'OFFSET'],
    ['INSERT INTO users (id) VALUES (1) ', 'ON CONFLICT'],
    ['INSERT INTO users (id) VALUES (1) ON CONFLICT (id) ', 'DO NOTHING'],
    ['DELETE FROM users WHERE id = 1 ', 'AND'],
  ])('offers the next clause after %p', (sql, first) => {
    expect(complete(sql).labels[0]).toBe(first)
  })

  it('offers RETURNING, not SELECT clauses, after a write', () => {
    expect(complete('DELETE FROM users WHERE id = 1 ').labels).toEqual([
      'AND',
      'OR',
      'RETURNING',
    ])
    expect(complete('UPDATE users SET email = 1 ').labels).toEqual([
      'WHERE',
      'RETURNING',
    ])
  })

  it('completes after a line comment', () => {
    expect(complete('-- header\nSELECT * FROM ').labels).toContain('users')
  })
})
