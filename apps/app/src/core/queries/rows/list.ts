import { mongoPage, selectPage } from '@tamery/connection/queries/select-page'
import type { ColumnTypes } from '@tamery/connection/queries/value-binding'
import { filterValueBindings } from '@tamery/connection/queries/value-binding'
import type { ActiveFilter } from '@tamery/shared/filters'
import { EQUAL_FILTER } from '@tamery/shared/filters'
import { infiniteQueryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { memoize } from 'memoza'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { ConnectionResource } from '~/core/connection/sync'
import { DEFAULT_PAGE_LIMIT } from '~/core/connection/utils'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { fromMongodbDocument } from './shape'

const rowType = type('Record<string, unknown>')

export const POSTHOG_ROWS_LIMIT = 1000

interface PageResult {
  isLast: boolean
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
    limit,
    query,
    ...props
  }: RowsQueryProps & { offset: number }) => {
    const page = { ...props, ...query, limit: limit ?? DEFAULT_PAGE_LIMIT }
    return createQuery({
      query: {
        clickhouse: (db) =>
          selectPage(
            db,
            page,
            filterValueBindings.clickhouse?.(columns)
          ).execute(),
        mongodb: async (db) => {
          const documents = await db
            .collection(page.table)
            .aggregate(mongoPage({ ...page, columnTypes: columns }))
          return documents.map((document) =>
            fromMongodbDocument(document, columns)
          )
        },
        mssql: (db) => selectPage(db, page).execute(),
        mysql: (db) => selectPage(db, page).execute(),
        oracle: (db) => selectPage(db, page).execute(),
        postgres: (db) => selectPage(db, page).execute(),
        // PostHog refuses OFFSET, so the first page is all it has.
        posthog: (db) =>
          page.offset === 0
            ? selectPage(db, {
                ...page,
                limit: limit ?? POSTHOG_ROWS_LIMIT,
              }).execute()
            : Promise.resolve([]),
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
      ) => (lastPage.isLast ? null : lastPageParam + pageLimit),
      initialPageParam: 0,
      queryFn: async ({ pageParam: offset }) => {
        const queryParams =
          await connectionResourceToQueryParams(connectionResource)
        const rows = await resourceRowsQuery({
          offset,
          query: {
            filters,
            filtersConcatOperator,
            orderBy,
          },
          schema,
          table,
          ...props,
        }).run(queryParams)

        return {
          isLast:
            rows.length < pageLimit ||
            getCapabilities(queryParams.dialect).flags.includes(
              'firstRowsOnly'
            ),
          rows,
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
