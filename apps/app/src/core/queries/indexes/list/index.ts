import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'

import type { ConnectionResource } from '~/core/connection/sync'
import { bitFlag, nullableString } from '~/core/queries/shared/catalog-fields'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { clickhouseIndexes } from './clickhouse'
import { duckdbIndexes } from './duckdb'
import { mongodbIndexes } from './mongodb'
import { mssqlIndexes } from './mssql'
import { mysqlIndexes } from './mysql'
import { oracleIndexes } from './oracle'
import { postgresIndexes } from './postgres'
import { sqliteIndexes } from './sqlite'

export const indexesType = type({
  column: nullableString,
  'custom_expression?': nullableString,
  'granularity?': 'number',
  'index_definition?': nullableString,
  'included_columns?': nullableString,
  'index_type?': 'string',
  'is_constraint?': bitFlag,
  'is_custom?': bitFlag,
  is_primary: bitFlag,
  is_unique: bitFlag,
  name: 'string',
  'predicate?': nullableString,
  'scans?': 'number | null',
  schema: 'string',
  'size_bytes?': 'number | null',
  table: 'string',
}).pipe(
  ({
    is_unique,
    is_primary,
    is_constraint,
    is_custom,
    index_type,
    index_definition,
    custom_expression,
    included_columns,
    size_bytes,
    ...data
  }) => ({
    ...data,
    constraintOwned: !!is_primary || !!is_constraint,
    custom: !!is_custom,
    customExpression: custom_expression ?? undefined,
    definition: index_definition,
    included: included_columns ?? undefined,
    isPrimary: !!is_primary,
    isUnique: !!is_unique,
    sizeBytes: size_bytes ?? undefined,
    type: index_type,
  })
)

export const structureQueryKey = (connectionResource: ConnectionResource) => [
  'connection-resource',
  connectionResource.id,
  'structure',
]

const resourceIndexesQuery = createQuery({
  query: {
    clickhouse: clickhouseIndexes,
    duckdb: duckdbIndexes,
    mongodb: mongodbIndexes,
    mssql: mssqlIndexes,
    mysql: mysqlIndexes,
    oracle: oracleIndexes,
    postgres: postgresIndexes,
    sqlite: sqliteIndexes,
  },
  type: indexesType.array(),
})

export const resourceIndexesQueryOptions = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) =>
  queryOptions({
    queryFn: async () =>
      resourceIndexesQuery.run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: [...structureQueryKey(connectionResource), 'indexes'],
  })
