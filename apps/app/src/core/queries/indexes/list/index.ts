import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'

import type { ConnectionResource } from '~/core/connection/sync'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { clickhouseIndexes } from './clickhouse'
import { mongodbIndexes } from './mongodb'
import { mssqlIndexes } from './mssql'
import { mysqlIndexes } from './mysql'
import { oracleIndexes } from './oracle'
import { postgresIndexes } from './postgres'
import { sqliteIndexes } from './sqlite'

export const indexesType = type({
  column: 'string | null',
  'custom_expression?': 'string | null',
  'granularity?': 'number',
  'index_definition?': 'string | null',
  'index_type?': 'string',
  'is_constraint?': 'boolean | 1 | 0',
  'is_custom?': 'boolean | 1 | 0',
  is_primary: 'boolean | 1 | 0',
  is_unique: 'boolean | 1 | 0',
  name: 'string',
  schema: 'string',
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
    ...data
  }) => ({
    ...data,
    constraintOwned: !!is_primary || !!is_constraint,
    custom: !!is_custom,
    customExpression: custom_expression ?? undefined,
    definition: index_definition,
    isPrimary: !!is_primary,
    isUnique: !!is_unique,
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
