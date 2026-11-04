import { describe, expect, it } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'

import type { SqlCatalog } from './catalog'
import { diagnose } from './diagnostics'
import { dialects } from './dialects'

const pg = dialects[Dialect.Postgres]
const catalog: SqlCatalog = {
  defaultSchema: 'public',
  enums: [{ name: 'status', values: ['active', "o'clock"] }],
  nameCase: null,
  schemas: [
    {
      name: 'public',
      tables: [
        {
          columns: [
            { name: 'id', nullable: false, type: 'int' },
            { name: 'email', nullable: true, type: 'text' },
            { name: 'created_at', nullable: false, type: 'timestamptz' },
            { name: 'token', nullable: true, type: 'uuid' },
            { name: 'status', nullable: false, type: 'status' },
          ],
          kind: 'table',
          name: 'users',
        },
        { columns: null, kind: 'table', name: 'posts' },
      ],
    },
    { name: 'audit', tables: [{ columns: [], kind: 'view', name: 'log' }] },
  ],
}
const messages = (sql: string, withCatalog = false) =>
  diagnose(sql, pg, withCatalog ? catalog : null).map(
    ({ message, severity }) => `${severity}: ${message}`
  )

const exact = (sql: string) =>
  diagnose(sql, pg, { ...catalog, nameCase: 'lower' }).map(
    ({ message }) => message
  )

describe('diagnose', () => {
  it('reports unterminated constructs and unbalanced brackets', () => {
    expect(messages("SELECT 'a")).toEqual(['error: Unterminated string'])
    expect(messages('SELECT (1')).toEqual(['error: Unclosed `(`'])
    expect(messages('SELECT 1)')).toEqual(['error: Unexpected `)`'])
    expect(messages('/* x')).toEqual(['error: Unterminated block comment'])
  })

  it('flags a misspelled statement verb only', () => {
    expect(messages('SELCT 1')).toEqual(['error: Unknown statement `SELCT`'])
    expect(messages('FROM users')).toEqual([])
    expect(messages('(SELECT 1) UNION (SELECT 2)')).toEqual([])
  })

  it('flags a qualifier that names no table or alias in scope', () => {
    expect(messages('SELECT w.email, count(m.id) FROM users w2', true)).toEqual(
      [
        'warning: `w` is not a table or alias in this statement — available: `w2`',
        'warning: `m` is not a table or alias in this statement — available: `w2`',
      ]
    )
    expect(messages('SELECT users.id FROM users u', true)).toEqual([])
    expect(
      messages(
        'SELECT s.n, public.users.id FROM (SELECT 1 AS n) s, public.users',
        true
      )
    ).toEqual([])
    expect(
      messages(
        'INSERT INTO users (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET email = excluded.email',
        true
      )
    ).toEqual([])
    expect(messages("SELECT '1'::public.status", true)).toEqual([])
  })

  it('flags bare columns missing from every source once all columns are known', () => {
    expect(
      messages('SELECT * FROM users WHERE email_verified = true', true)
    ).toEqual(['warning: Unknown column `email_verified` — not in `users`'])
    expect(
      messages(
        'SELECT email, count(*) AS n FROM users u WHERE u.id > 1 GROUP BY email ORDER BY n, EXTRACT(YEAR FROM now())',
        true
      )
    ).toEqual([])
    expect(messages('SELECT anything FROM posts', true)).toEqual([])
    expect(messages('SELECT n FROM (SELECT 1 AS n) s, users', true)).toEqual([])
    expect(
      messages('INSERT INTO users (id, nope) VALUES (1, 2)', true)
    ).toEqual(['warning: Unknown column `nope` — not in `users`'])
  })

  it('accepts clauses whose words look like tables or columns', () => {
    const valid = [
      'SELECT * FROM users FOR UPDATE',
      'SELECT * FROM users FOR UPDATE NOWAIT',
      'SELECT * FROM users FOR UPDATE OF users',
      'SELECT * FROM users FOR UPDATE SKIP LOCKED',
      'SELECT * FROM users FOR NO KEY UPDATE',
      'SELECT * FROM users FOR SHARE',
      'CREATE TEMP TABLE scratch (a int)',
      'CREATE TEMPORARY TABLE scratch (a int)',
      'CREATE UNLOGGED TABLE scratch (a int)',
      'CREATE TABLE IF NOT EXISTS scratch (a int)',
      'WITH RECURSIVE t(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM t WHERE n < 5) SELECT n FROM t',
      'WITH x AS MATERIALIZED (SELECT 1) SELECT * FROM x',
      'WITH x AS NOT MATERIALIZED (SELECT 1) SELECT * FROM x',
      "SELECT created_at AT TIME ZONE 'UTC' FROM users",
    ]
    expect(
      valid.flatMap((sql) =>
        messages(sql, true).map((message) => `${sql} → ${message}`)
      )
    ).toEqual([])
    expect(
      diagnose(
        "INSERT INTO users (email) VALUES ('a') ON DUPLICATE KEY UPDATE email = VALUES(email)",
        dialects[Dialect.MySQL],
        catalog
      )
    ).toEqual([])
  })

  it('checks tables and qualified columns against the catalog', () => {
    expect(
      messages(
        'SELECT u.id, u.nmae FROM users u JOIN postz p ON p.id = u.id',
        true
      )
    ).toEqual([
      'warning: Unknown column `nmae` on `users`',
      'warning: Unknown table `postz`',
    ])
    expect(messages('SELECT p.anything FROM posts p', true)).toEqual([])
    expect(
      messages('SELECT * FROM audit.log, generate_series(1, 3)', true)
    ).toEqual([])
    expect(messages('WITH x AS (SELECT 1) SELECT * FROM x', true)).toEqual([])
    expect(
      messages(
        'CREATE TABLE fresh (id int); INSERT INTO fresh (id) VALUES (1)',
        true
      )
    ).toEqual(['warning: Unknown table `fresh`'])
  })

  it('flags a string compared with a UUID column that no engine would parse', () => {
    expect(
      messages(
        "SELECT * FROM users u WHERE token = '123' OR u.token <> 'abc' AND email = '123'",
        true
      )
    ).toEqual([
      "warning: '123' is not a valid UUID for `token` (uuid)",
      "warning: 'abc' is not a valid UUID for `token` (uuid)",
    ])
    expect(
      messages(
        "SELECT * FROM users WHERE token = '11111111-1111-1111-1111-111111111111' OR token = '{A0EEBC999C0B4EF8BB6D6BB9BD380A11}'",
        true
      )
    ).toEqual([])
  })

  it('flags a string outside an enum or not an integer', () => {
    expect(
      messages(
        "SELECT * FROM users WHERE status = 'actve' OR status = 'ACTIVE' OR status = 'o''clock' OR id = 'abc' OR id = ' 1_000 ' OR email = 'abc'",
        true
      )
    ).toEqual([
      "warning: 'actve' is not one of 'active', 'o'clock' for `status` (status)",
      "warning: 'abc' is not an integer for `id` (int)",
    ])
  })

  it('flags `= NULL` in conditions, not in assignments', () => {
    expect(
      messages('UPDATE users SET email = NULL WHERE email = NULL OR id <> NULL')
    ).toEqual([
      'warning: `= NULL` is never true — use `IS NULL`',
      'warning: `<> NULL` is never true — use `IS NOT NULL`',
    ])
    expect(
      messages(
        'SELECT CASE WHEN a = NULL THEN 1 END FROM t JOIN u ON u.a = NULL'
      )
    ).toEqual([
      'warning: `= NULL` is never true — use `IS NULL`',
      'warning: `= NULL` is never true — use `IS NULL`',
    ])
    expect(
      diagnose(
        'CREATE PROCEDURE p @a int = NULL AS SELECT 1',
        dialects[Dialect.MSSQL],
        null
      )
    ).toEqual([])
  })

  it('matches Postgres names exactly once unquoted ones fold', () => {
    expect(exact('SELECT ID FROM USERS')).toEqual([])
    expect(exact('SELECT "ID" FROM "Users"')).toEqual(['Unknown table `Users`'])
    expect(exact('SELECT "ID" FROM users')).toEqual([
      'Unknown column `ID` — not in `users`',
    ])
  })

  it('warns that a GO repeat count is ignored', () => {
    expect(diagnose('SELECT 1\nGO 2', dialects[Dialect.MSSQL], null)).toEqual([
      {
        end: 13,
        message: 'The repeat count is ignored — the batch runs once',
        severity: 'warning',
        start: 12,
      },
    ])
  })
})
