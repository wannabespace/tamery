import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'

import type { ConnectionResource } from '~/core/connection/sync'
import { structureQueryKey } from '~/core/queries/indexes/list'
import {
  bitFlag,
  nullableString,
  oneOf,
} from '~/core/queries/shared/catalog-fields'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import type { LISTED_CONSTRAINT_TYPES } from '../shape'
import { clickhouseConstraints } from './clickhouse'
import { duckdbConstraints } from './duckdb'
import { mongodbConstraints } from './mongodb'
import { mssqlConstraints } from './mssql'
import { mysqlConstraints } from './mysql'
import { oracleConstraints } from './oracle'
import { postgresConstraints } from './postgres'
import { sqliteConstraints } from './sqlite'

const constraintType = oneOf(
  'PRIMARY KEY',
  'UNIQUE',
  'FOREIGN KEY',
  'CHECK',
  'EXCLUSION'
)

const constraintTypeLabelMap = {
  CHECK: 'check',
  EXCLUSION: 'exclusion',
  'FOREIGN KEY': 'foreignKey',
  'PRIMARY KEY': 'primaryKey',
  UNIQUE: 'unique',
} as const satisfies Record<typeof constraintType.infer, string>

export const constraintsType = type({
  column: nullableString,
  'definition?': 'string',
  'expression?': nullableString,
  foreign_column: nullableString,
  foreign_schema: nullableString,
  foreign_table: nullableString,
  'is_custom?': bitFlag,
  name: 'string',
  onDelete: nullableString,
  onUpdate: nullableString,
  schema: 'string',
  table: 'string',
  type: constraintType,
}).pipe(
  ({
    type: constraintKind,
    expression,
    foreign_column,
    foreign_table,
    foreign_schema,
    is_custom,
    ...item
  }) => ({
    ...item,
    custom: !!is_custom,
    expression: expression?.trim() ?? null,
    foreignColumn: foreign_column,
    foreignSchema: foreign_schema,
    foreignTable: foreign_table,
    type: constraintTypeLabelMap[
      constraintKind as (typeof LISTED_CONSTRAINT_TYPES)[number]
    ],
  })
)

const resourceConstraintsQuery = createQuery({
  query: {
    clickhouse: clickhouseConstraints,
    duckdb: duckdbConstraints,
    mongodb: mongodbConstraints,
    mssql: mssqlConstraints,
    mysql: mysqlConstraints,
    oracle: oracleConstraints,
    postgres: postgresConstraints,
    sqlite: sqliteConstraints,
  },
  type: constraintsType.array(),
})

export const resourceConstraintsQueryOptions = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) =>
  queryOptions({
    queryFn: async () =>
      resourceConstraintsQuery.run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: [...structureQueryKey(connectionResource), 'constraints'],
  })
