import { expect, test } from 'bun:test'

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely'

import { unsupported } from '../unsupported'
import { toKyselyFilter } from './kysely'
import { EQUAL_FILTER } from './list'

const db = new Kysely<Record<string, Record<string, unknown>>>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (kysely) => new PostgresIntrospector(kysely),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})

test('a filter through a foreign key matches keys of the referenced rows', () => {
  const { parameters, sql } = db
    .selectFrom('connections')
    .selectAll()
    .where((eb) =>
      toKyselyFilter(
        eb,
        [
          {
            column: 'user_id',
            ref: EQUAL_FILTER,
            values: ['ada@example.com'],
            via: {
              key: 'id',
              schema: 'public',
              table: 'users',
              target: 'email',
            },
          },
        ],
        'AND',
        { jsonText: unsupported('JSON paths') }
      )
    )
    .compile()

  expect(sql).toBe(
    'select * from "connections" where "user_id" in (select "id" from "public"."users" where "email" = $1)'
  )
  expect(parameters).toEqual(['ada@example.com'])
})
