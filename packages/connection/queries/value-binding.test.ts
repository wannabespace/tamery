import { expect, test } from 'bun:test'

import type { SqlDialect } from '@tamery/shared/enums/connection-type'
import { Dialect } from '@tamery/shared/enums/connection-type'
import type { ActiveFilter } from '@tamery/shared/filters'
import { EQUAL_FILTER, SQL_FILTER, toKyselyFilter } from '@tamery/shared/filters'

import { prepareQuery } from './dialects/clickhouse/prepare-query'
import { coldDialect } from './kysely'
import { filterSpellings } from './value-binding'

const filtered = (
  dialect: SqlDialect,
  filters: ActiveFilter[],
  columns: { id: string; type: string }[]
) =>
  coldDialect(dialect)
    .withTables<Record<string, Record<string, unknown>>>()
    .selectFrom('events')
    .selectAll()
    .where((eb) =>
      toKyselyFilter(
        eb,
        filters,
        'AND',
        filterSpellings[dialect](columns)
      )
    )
    .compile()

test('ClickHouse filters parse ISO text for a DateTime column and keep it for a String one', () => {
  const iso = '2024-02-29T13:45:10Z'
  const query = filtered(
    Dialect.ClickHouse,
    ['at', 'note'].map((column) => ({
      column,
      ref: EQUAL_FILTER,
      values: [iso],
    })),
    [
      { id: 'at', type: 'DateTime' },
      { id: 'note', type: 'String' },
    ]
  )

  expect(prepareQuery(query)).toBe(
    `select * from \`events\` where (\`at\` = parseDateTime64BestEffort('${iso}', 0) and \`note\` = '${iso}')`
  )
})

test('SQLite filters bind true and false as 1 and 0 on a boolean column only', () => {
  const { parameters } = filtered(
    Dialect.SQLite,
    [
      { column: 'active', ref: EQUAL_FILTER, values: ['true'] },
      { column: 'note', ref: EQUAL_FILTER, values: ['false'] },
    ],
    [
      { id: 'active', type: 'boolean' },
      { id: 'note', type: 'text' },
    ]
  )

  expect(parameters).toEqual([1, 'false'])
})

test('a nested-value filter compares the text at its JSON path', () => {
  const nested: ActiveFilter[] = [
    {
      column: 'payload',
      path: ['user', '0', 'first name'],
      ref: EQUAL_FILTER,
      values: ['ada'],
    },
  ]

  expect(filtered(Dialect.Postgres, nested, []).sql).toBe(
    'select * from "events" where "payload" #>> array[$1, $2, $3]::text[] = $4'
  )
  expect(filtered(Dialect.MySQL, nested, []).sql).toBe(
    `select * from \`events\` where json_unquote(json_extract(\`payload\`, '$.user[0]."first name"')) = ?`
  )
  expect(filtered(Dialect.Oracle, nested, []).sql).toContain(
    `json_value("payload", '$.user[0]."first name"') = :1`
  )
})

test('a JSON path cannot close its literal', () => {
  const { sql } = filtered(
    Dialect.SQLite,
    [{ column: 'payload', path: ["a' or 1=1 --"], ref: EQUAL_FILTER, values: ['x'] }],
    []
  )

  expect(sql).toContain(`'$."a'' or 1=1 --"'`)
})

test('a SQL filter goes in as its own parenthesized condition', () => {
  const { sql } = filtered(
    Dialect.Postgres,
    [
      { column: '', ref: SQL_FILTER, values: ['a = 1 or b = 2'] },
      { column: 'note', ref: EQUAL_FILTER, values: ['x'] },
    ],
    []
  )

  expect(sql).toBe(
    'select * from "events" where ((a = 1 or b = 2) and "note" = $1)'
  )
})
