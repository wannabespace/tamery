import { toWire } from '@tamery/mongo/values'
import type { ActiveFilter, FilterValueBinding } from '@tamery/shared/filters'
import { toKyselyFilter, toMongoPipeline } from '@tamery/shared/filters'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import type { ColumnTypes } from './value-binding'

// Columns go through `sql.id`: a plain string is parsed, so `first name` reads as a column and a direction, `a.b` as a table and a column.
export const selectPage = (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  {
    filters,
    filtersConcatOperator,
    limit,
    offset,
    orderBy = {},
    schema,
    select,
    table,
  }: {
    filters?: ActiveFilter[]
    filtersConcatOperator?: 'AND' | 'OR'
    limit: number
    offset: number
    orderBy?: Record<string, 'ASC' | 'DESC'>
    schema: string
    select?: string[]
    table: string
  },
  bind?: FilterValueBinding
) => {
  let query = db
    .withSchema(schema)
    .$extendTables<{ [table]: Record<string, unknown> }>()
    .selectFrom(table)

  query =
    select === undefined
      ? query.selectAll()
      : query.select(select.map((column) => sql.id(column).as(column)))

  if (filters !== undefined) {
    query = query.where((eb) =>
      toKyselyFilter(eb, filters, filtersConcatOperator, bind)
    )
  }

  for (const [column, direction] of Object.entries(orderBy)) {
    query = query.orderBy(sql.id(column), direction === 'ASC' ? 'asc' : 'desc')
  }

  return query.limit(limit).offset(offset)
}

export const mongoPage = ({
  columnTypes = [],
  filters = [],
  filtersConcatOperator,
  limit,
  offset,
  orderBy = {},
  select,
}: {
  columnTypes?: ColumnTypes
  filters?: ActiveFilter[]
  filtersConcatOperator?: 'AND' | 'OR'
  limit: number
  offset: number
  orderBy?: Record<string, 'ASC' | 'DESC'>
  select?: string[]
}): Record<string, unknown>[] => {
  // `_id` last keeps rows that tie on the sort in one order across pages.
  const sort = { ...orderBy, _id: orderBy._id ?? 'ASC' }
  return [
    ...toMongoPipeline(filters, filtersConcatOperator, (column, value) =>
      toWire(columnTypes.find(({ id }) => id === column)?.type ?? '', value)
    ),
    {
      $sort: Object.fromEntries(
        Object.entries(sort).map(([column, direction]) => [
          column,
          direction === 'ASC' ? 1 : -1,
        ])
      ),
    },
    { $skip: offset },
    { $limit: limit },
    ...(select
      ? [{ $project: Object.fromEntries(select.map((column) => [column, 1])) }]
      : []),
  ]
}
