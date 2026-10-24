import { unsupported } from '@tamery/shared/unsupported'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { sql } from 'kysely'

import type { ConnectionResource } from '~/core/connection/sync'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { BLOCK_OPERATIONS } from './shape'

export const policyType = type({
  check: 'string | null',
  command: 'string',
  enabled: 'boolean',
  name: 'string',
  'predicates?': type({
    definition: 'string',
    kind: '"FILTER" | "BLOCK"',
    operation: type.enumerated(...BLOCK_OPERATIONS).or('null'),
    schema: 'string',
    table: 'string',
  }).array(),
  roles: 'string[]',
  schema: 'string',
  table: 'string',
  type: '"PERMISSIVE" | "RESTRICTIVE"',
  using: 'string | null',
})

const query = createQuery({
  query: {
    clickhouse: async (db) => {
      const rows = await db
        .selectFrom('system.row_policies')
        .select([
          'database',
          'table',
          // name is "<policy> ON <db>.<table>"; DROP takes the short name.
          'short_name as name',
          'is_restrictive',
          'select_filter',
          'apply_to_all',
          'apply_to_list',
          'apply_to_except',
        ])
        .where('database', 'not in', ['system', 'information_schema'])
        .execute()
      return rows.map((row) => ({
        check: null,
        command: 'SELECT',
        enabled: true,
        name: row.name,
        roles: row.apply_to_all
          ? ['ALL', ...row.apply_to_except.map((role) => `EXCEPT ${role}`)]
          : row.apply_to_list,
        schema: row.database,
        table: row.table,
        type: row.is_restrictive === 1 ? 'RESTRICTIVE' : 'PERMISSIVE',
        using: row.select_filter,
      }))
    },
    mongodb: unsupported('Row policies'),
    mssql: async (db) => {
      const rows = await db
        .selectFrom('sys.security_policies as sp')
        .innerJoin('sys.schemas as s', 'sp.schema_id', 's.schema_id')
        .leftJoin(
          'sys.security_predicates as pr',
          'sp.object_id',
          'pr.object_id'
        )
        .leftJoin('sys.tables as t', 'pr.target_object_id', 't.object_id')
        .leftJoin(
          'sys.schemas as table_schema',
          't.schema_id',
          'table_schema.schema_id'
        )
        .select([
          'sp.object_id',
          's.name as policySchema',
          'sp.name',
          'sp.is_enabled',
          'pr.predicate_type_desc as kind',
          'pr.operation_desc as operation',
          'pr.predicate_definition as definition',
          'table_schema.name as schema',
          't.name as table',
        ])
        .orderBy('sp.object_id')
        .orderBy('pr.security_predicate_id')
        .execute()

      return [...Map.groupBy(rows, (row) => row.object_id).values()].map(
        (group) => {
          const predicates = group.flatMap(
            ({ definition, kind, operation, schema, table }) =>
              definition && kind && schema && table
                ? [{ definition, kind, operation, schema, table }]
                : []
          )

          return {
            check: null,
            command: [...new Set(predicates.map(({ kind }) => kind))].join(
              ', '
            ),
            enabled: group[0]?.is_enabled ?? false,
            name: group[0]?.name ?? '',
            predicates,
            roles: [],
            schema: group[0]?.policySchema ?? '',
            table: [...new Set(predicates.map(({ table }) => table))].join(
              ', '
            ),
            type: 'RESTRICTIVE' as const,
            using: null,
          }
        }
      )
    },
    mysql: unsupported('Row policies'),
    oracle: unsupported('Row policies'),
    postgres: async (db) => {
      const rows = await db
        .selectFrom('pg_catalog.pg_policies as p')
        .innerJoin('pg_catalog.pg_namespace as n', (join) =>
          join.onRef('n.nspname', '=', 'p.schemaname')
        )
        .innerJoin('pg_catalog.pg_class as c', (join) =>
          join
            .onRef('c.relname', '=', 'p.tablename')
            .onRef('c.relnamespace', '=', 'n.oid')
        )
        .select([
          'p.schemaname',
          'p.tablename',
          'p.policyname',
          'p.permissive',
          sql<string[]>`p.roles::text[]`.as('roles'),
          'p.cmd',
          'p.qual',
          'p.with_check',
          'c.relrowsecurity as enabled',
        ])
        .execute()
      return rows.map((row) => ({
        check: row.with_check,
        command: row.cmd,
        enabled: row.enabled,
        name: row.policyname,
        roles: row.roles,
        schema: row.schemaname,
        table: row.tablename,
        type: row.permissive,
        using: row.qual,
      }))
    },
    sqlite: unsupported('Row policies'),
  },
  type: policyType.array(),
})

export const resourcePoliciesQueryOptions = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) =>
  queryOptions({
    queryFn: async () =>
      query.run(await connectionResourceToQueryParams(connectionResource)),
    queryKey: ['connection-resource', connectionResource.id, 'policies'],
  })
