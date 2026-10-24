import { selectPage } from '@tamery/connection/queries/select-page'
import type { ColumnTypes } from '@tamery/connection/queries/value-binding'
import { filterValueBindings } from '@tamery/connection/queries/value-binding'
import type { ActiveFilter } from '@tamery/shared/filters'
import { EQUAL_FILTER } from '@tamery/shared/filters'
import { infiniteQueryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { memoize } from 'memoza'

import type { ConnectionResource } from '~/core/connection/sync'
import { DEFAULT_PAGE_LIMIT } from '~/core/connection/utils'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { fromMongodbDocument, mongodbMatch } from './shape'

const rowType = type('Record<string, unknown>')

interface PageResult {
  rows: (typeof rowType.inferIn)[]
}

export interface RowsQueryProps {
  /** The table's columns, whose types ClickHouse and SQLite bind filter values by. */
  columns?: ColumnTypes
  limit?: number
  select?: string[]
  table: string
  schema: string
  query: {
    filtersConcatOperator?: 'AND' | 'OR'
    orderBy?: Record<string, 'ASC' | 'DESC'>
    filters?: ActiveFilter[]
  }
}

export const resourceRowsQuery = memoize(
  ({
    columns = [],
    limit = DEFAULT_PAGE_LIMIT,
    query,
    ...props
  }: RowsQueryProps & { offset: number }) => {
    const page = { ...props, ...query, limit }
    return createQuery({
      query: {
        clickhouse: (db) =>
          selectPage(
            db,
            page,
            filterValueBindings.clickhouse?.(columns)
          ).execute(),
        mongodb: async (db) => {
          const { orderBy = {}, filters, filtersConcatOperator, offset } = page
          // `_id` last keeps rows that tie on the sort in one order across pages.
          const sort = { ...orderBy, _id: orderBy._id ?? 'ASC' }
          const documents = await db.collection(page.table).aggregate([
            ...mongodbMatch(columns, filters, filtersConcatOperator),
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
            ...(page.select
              ? [
                  {
                    $project: Object.fromEntries(
                      page.select.map((column) => [column, 1])
                    ),
                  },
                ]
              : []),
          ])
          return documents.map(fromMongodbDocument)
        },
        mssql: (db) => selectPage(db, page).execute(),
        mysql: (db) => selectPage(db, page).execute(),
        oracle: (db) => selectPage(db, page).execute(),
        postgres: (db) => selectPage(db, page).execute(),
        sqlite: (db) =>
          selectPage(db, page, filterValueBindings.sqlite?.(columns)).execute(),
      },
      type: rowType.array(),
    })
  }
)

export const resourceRowsQueryKey = ({
  connectionResource,
  schema,
  table,
}: {
  connectionResource: ConnectionResource
  schema: string
  table: string
}) => [
  'connection-resource',
  connectionResource.id,
  'schema',
  schema,
  'table',
  table,
  'rows',
]

export const resourceRowsQueryInfiniteOptions = memoize(
  ({
    connectionResource,
    schema,
    table,
    query: { orderBy, filters, filtersConcatOperator },
    ...props
  }: {
    connectionResource: ConnectionResource
  } & RowsQueryProps) => {
    const pageLimit = props.limit ?? DEFAULT_PAGE_LIMIT

    return infiniteQueryOptions({
      getNextPageParam: (
        lastPage: PageResult,
        _allPages: PageResult[],
        lastPageParam: number
      ) =>
        lastPage.rows.length === 0 || lastPage.rows.length < pageLimit
          ? null
          : lastPageParam + pageLimit,
      initialPageParam: 0,
      queryFn: async ({ pageParam: offset }) => {
        const result = await resourceRowsQuery({
          offset,
          query: {
            filters,
            filtersConcatOperator,
            orderBy,
          },
          schema,
          table,
          ...props,
        }).run(await connectionResourceToQueryParams(connectionResource))

        return {
          rows: result,
        } satisfies PageResult
      },
      queryKey: [
        ...resourceRowsQueryKey({ connectionResource, schema, table }),
        {
          filters,
          filtersConcatOperator,
          orderBy,
        },
      ],
      select: (data) => data.pages.flatMap((page) => page.rows),
      throwOnError: false,
    })
  }
)

/** The reference peek and the reference picker share this cache entry. */
export const matchingRowsQueryOptions = ({
  column,
  connectionResource,
  schema,
  table,
  value,
}: {
  column: string
  connectionResource: ConnectionResource
  schema: string
  table: string
  value: unknown
}) =>
  resourceRowsQueryInfiniteOptions({
    connectionResource,
    query: { filters: [{ column, ref: EQUAL_FILTER, values: [value] }] },
    schema,
    table,
  })
