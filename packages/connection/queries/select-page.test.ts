import { expect, test } from 'bun:test'

import { Dialect } from '@tamery/shared/enums/connection-type'
import { EQUAL_FILTER } from '@tamery/shared/filters'

import { coldDialect } from './kysely'
import { mongoPage, selectPage } from './select-page'

test('a column name with a space or a dot stays one identifier', () => {
  const { sql } = selectPage(coldDialect(Dialect.Postgres), {
    filters: [{ column: 'a.b', ref: EQUAL_FILTER, values: [1] }],
    limit: 10,
    offset: 0,
    orderBy: { 'first name': 'DESC' },
    schema: 'public',
    select: ['first name', 'a.b'],
    table: 'people',
  }).compile()

  expect(sql).toBe(
    'select "first name" as "first name", "a.b" as "a.b" from "public"."people" where "a.b" = $1 order by "first name" desc limit $2 offset $3'
  )
})

test('mongoPage binds filter values by column type and breaks sort ties on _id', () => {
  expect(
    mongoPage({
      columnTypes: [{ id: '_id', type: 'objectId' }],
      filters: [
        {
          column: '_id',
          ref: EQUAL_FILTER,
          values: ['507f1f77bcf86cd799439011'],
        },
      ],
      limit: 100,
      offset: 200,
      orderBy: { name: 'DESC' },
      select: ['_id', 'name'],
    })
  ).toEqual([
    {
      $match: {
        $and: [{ _id: { $eq: { $oid: '507f1f77bcf86cd799439011' } } }],
      },
    },
    { $sort: { name: -1, _id: 1 } },
    { $skip: 200 },
    { $limit: 100 },
    { $project: { _id: 1, name: 1 } },
  ])
})

test('mongoPage keeps an explicit _id sort instead of appending its own', () => {
  const [sort] = mongoPage({ limit: 10, offset: 0, orderBy: { _id: 'DESC' } })
  expect(sort).toEqual({ $sort: { _id: -1 } })
})
