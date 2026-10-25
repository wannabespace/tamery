import { expect, test } from 'bun:test'

import { prepareQuery } from '@tamery/connection/queries/dialects/clickhouse/prepare-query'
import { coldDialect } from '@tamery/connection/queries/kysely'
import { Dialect } from '@tamery/shared/enums/connection-type'

import {
  bindRow,
  bindValue,
  clickhouseWrite,
  fromMongodbDocument,
  matchesPrimaryKeys,
  mongodbDocument,
  rowIdentity,
} from './shape'

const clickhouse = coldDialect(Dialect.ClickHouse).withTables<
  Record<string, Record<string, unknown>>
>()

const postgres = coldDialect(Dialect.Postgres).withTables<
  Record<string, Record<string, unknown>>
>()

test('ClickHouse parses ISO text for a DateTime column only, in SET and WHERE', () => {
  const columns = [
    { id: 'at', type: "DateTime64(3, 'UTC')" },
    { id: 'note', type: 'String' },
  ]
  const iso = '2024-02-29T13:45:10.123Z'
  const query = clickhouse
    .updateTable('events')
    .set(bindRow(bindValue.clickhouse, columns, { note: iso }))
    .where((eb) =>
      matchesPrimaryKeys(eb, bindValue.clickhouse, columns, { at: iso })
    )

  expect(prepareQuery(query.compile())).toBe(
    `alter table \`events\` update \`note\` = '${iso}' where \`at\` = parseDateTime64BestEffort('${iso}', 3) settings mutations_sync = 1`
  )
})

test('a json column binds json text, NULL as is and undefined as DEFAULT', () => {
  const columns = [{ id: 'tags', type: 'jsonb' }]
  const { parameters, sql } = postgres
    .updateTable('posts')
    .set(bindRow(bindValue.postgres, columns, { tags: ['a'] }))
    .set(bindRow(bindValue.postgres, [], { body: undefined, title: null }))
    .compile()

  expect(sql).toBe(
    'update "posts" set "tags" = $1, "body" = default, "title" = $2'
  )
  expect(parameters).toEqual(['["a"]', null])
})

test('a ClickHouse write without format() runs again with JSONExtract', async () => {
  const columns = [{ id: 'tags', type: 'Map(String, UInt8)' }]
  const sent: string[] = []
  await clickhouseWrite((bind) => {
    const statement = prepareQuery(
      clickhouse
        .updateTable('events')
        .set(bindRow(bind, columns, { tags: { a: 1 } }))
        .where('id', '=', 1)
        .compile()
    )
    sent.push(statement)
    return statement.includes('format(')
      ? Promise.reject(new Error('Unknown table function format'))
      : Promise.resolve()
  })

  expect(sent.at(-1)).toBe(
    `alter table \`events\` update \`tags\` = CAST(JSONExtractKeysAndValues('{"v":{"a":1}}', 'v', 'UInt8'), 'Map(String, UInt8)') where \`id\` = 1 settings mutations_sync = 1`
  )
})

test('a row without a primary key is found by a NOT NULL unique key, else by every comparable column', () => {
  expect(
    rowIdentity(
      [
        { id: 'id', primaryKey: 'pk', type: 'integer' },
        { id: 'name', type: 'text' },
      ],
      Dialect.Postgres
    )
  ).toEqual({ columns: ['id'], unique: true })
  expect(
    rowIdentity(
      [
        { id: 'ts', primaryKey: 'pk', type: 'DateTime' },
        { id: 'name', type: 'String' },
      ],
      Dialect.ClickHouse
    )
  ).toEqual({ columns: ['ts', 'name'], unique: false })
  expect(
    rowIdentity(
      [
        { id: 'email', isNullable: false, type: 'text', unique: 'users_email' },
        { id: 'name', type: 'text' },
      ],
      Dialect.Postgres
    )
  ).toEqual({ columns: ['email'], unique: true })
  expect(
    rowIdentity(
      [
        { id: 'email', isNullable: true, type: 'text', unique: 'users_email' },
        { id: 'doc', type: 'json' },
        { id: 'at', type: 'point' },
        { id: 'tags', isArray: true, type: 'text' },
        { id: 'score', type: 'real' },
        { id: 'name', type: 'text' },
      ],
      Dialect.Postgres
    )
  ).toEqual({ columns: ['email', 'score', 'name'], unique: false })
})

test('a NULL in a row identity matches with IS NULL', () => {
  const query = postgres
    .deleteFrom('events')
    .where((eb) =>
      matchesPrimaryKeys(eb, bindValue.postgres, [], { name: null, id: 1 })
    )
    .compile()
  expect(query.sql).toBe(
    'delete from "events" where ("name" is null and "id" = $1)'
  )
})

test('a mixed _id column keeps BSON identity so a write matches the exact document', () => {
  const mixed = [{ id: '_id', type: 'mixed' }]
  const oid = { $oid: '6ad7b564729d8ccee1efdaed' }

  // An ObjectId stays Extended JSON, distinct from a string _id of the same hex.
  expect(fromMongodbDocument({ _id: oid }, mixed)).toStrictEqual({ _id: oid })
  expect(
    fromMongodbDocument({ _id: '6ad7b564729d8ccee1efdaed' }, mixed)
  ).toStrictEqual({ _id: '6ad7b564729d8ccee1efdaed' })

  // A single-type column still shows the plain value, which toWire rebuilds.
  expect(
    fromMongodbDocument({ _id: oid }, [{ id: '_id', type: 'objectId' }])
  ).toStrictEqual({ _id: '6ad7b564729d8ccee1efdaed' })

  // The write filter carries the ObjectId back, not its bare hex.
  expect(mongodbDocument(mixed, { _id: oid })).toStrictEqual({ _id: oid })
})
