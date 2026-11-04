import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { memoize } from 'memoza'

import type { ConnectionResource } from '~/core/connection/sync'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import type { ColumnDefinition, ColumnsFilter } from '../shape'
import { clickhouseColumns } from './clickhouse'
import { mongodbColumns } from './mongodb'
import { mssqlColumns } from './mssql'
import { mysqlColumns } from './mysql'
import { oracleColumns } from './oracle'
import { postgresColumns } from './postgres'
import { sqliteColumns } from './sqlite'

export const columnType = type({
  // MySQL: the clauses a MODIFY COLUMN drops unless it repeats them.
  'attributes?': 'string',
  'collation?': 'string | null',
  comment: 'string | null',
  'declaredType?': 'string | null',
  default: 'string | null',
  'editable?': 'boolean | 1 | 0',
  'enumName?': 'string',
  id: 'string',
  'isArray?': 'boolean',
  'isGenerated?': 'boolean | number | null',
  'isIdentity?': 'boolean | number | null',
  'maxLength?': 'number | null',
  nullable: 'boolean | 1 | 0',
  'precision?': 'number | null',
  'scale?': 'number | null',
  schema: 'string',
  table: 'string',
  type: 'string',
  'typeLabel?': 'string',
}).pipe(
  ({ typeLabel, editable, nullable, isGenerated, isIdentity, ...data }) => ({
    ...data,
    isEditable: Boolean(editable ?? true),
    isGenerated: Boolean(isGenerated),
    isIdentity: Boolean(isIdentity),
    isNullable: Boolean(nullable),
    typeLabel: typeLabel ?? data.type,
  })
)

type CatalogColumn = Partial<
  Pick<
    typeof columnType.infer,
    | 'attributes'
    | 'collation'
    | 'comment'
    | 'declaredType'
    | 'isGenerated'
    | 'isIdentity'
    | 'isNullable'
    | 'typeLabel'
  >
>

export const getColumnDefinition = (
  column: CatalogColumn
): ColumnDefinition => ({
  attributes: column.attributes ?? '',
  collation: column.collation ?? null,
  comment: column.comment ?? null,
  nullable: !!column.isNullable,
  type: column.declaredType ?? column.typeLabel ?? '',
})

export const isComputed = (column: CatalogColumn) =>
  !!column.isGenerated && !column.isIdentity

const columnsQuery = memoize((filter: ColumnsFilter) =>
  createQuery({
    query: {
      clickhouse: (db) => clickhouseColumns(db, filter),
      mongodb: (db) => mongodbColumns(db, filter),
      mssql: (db) => mssqlColumns(db, filter),
      mysql: (db) => mysqlColumns(db, filter),
      oracle: (db) => oracleColumns(db, filter),
      postgres: (db) => postgresColumns(db, filter),
      sqlite: (db) => sqliteColumns(db, filter),
    },
    type: columnType.array(),
  })
)

export const resourceColumnsQueryKey = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) => ['connection-resource', connectionResource.id, 'columns']

export const resourceTableColumnsQueryOptions = ({
  connectionResource,
  table,
  schema,
}: {
  connectionResource: ConnectionResource
  table: string
  schema: string
}) =>
  queryOptions({
    queryFn: async () =>
      columnsQuery({ schema, table }).run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: [
      ...resourceColumnsQueryKey({ connectionResource }),
      schema,
      table,
    ],
  })

export const resourceColumnsQueryOptions = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) =>
  queryOptions({
    queryFn: async () =>
      columnsQuery(null).run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: [...resourceColumnsQueryKey({ connectionResource }), 'all'],
  })

export const resourceTableColumnIdsQueryOptions = (
  params: Parameters<typeof resourceTableColumnsQueryOptions>[0]
) => ({
  ...resourceTableColumnsQueryOptions(params),
  select: (columns: (typeof columnType.infer)[]) =>
    columns.map((column) => column.id),
})
