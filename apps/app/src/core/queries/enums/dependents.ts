import { unsupported } from '@tamery/shared/unsupported'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { sql } from 'kysely'

import type { ConnectionResource } from '~/core/connection/sync'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

const enumDependentType = type({
  column: 'string',
  default: 'string | null',
  isArray: 'boolean',
  schema: 'string',
  table: 'string',
})

export type EnumDependent = typeof enumDependentType.infer

const dependentsQuery = ({ name, schema }: { name: string; schema: string }) =>
  createQuery({
    query: {
      clickhouse: () => Promise.resolve([]),
      mongodb: unsupported('Enums'),
      mssql: () => Promise.resolve([]),
      mysql: () => Promise.resolve([]),
      oracle: () => Promise.resolve([]),
      postgres: (db) =>
        db
          .selectFrom('pg_catalog.pg_type as e')
          .innerJoin(
            'pg_catalog.pg_namespace as en',
            'en.oid',
            'e.typnamespace'
          )
          .innerJoin('pg_catalog.pg_attribute as a', (join) =>
            join.on((eb) =>
              eb.or([
                eb('a.atttypid', '=', eb.ref('e.oid')),
                eb('a.atttypid', '=', eb.ref('e.typarray')),
              ])
            )
          )
          .innerJoin('pg_catalog.pg_type as at', 'at.oid', 'a.atttypid')
          .innerJoin('pg_catalog.pg_class as c', 'c.oid', 'a.attrelid')
          .innerJoin('pg_catalog.pg_namespace as n', 'n.oid', 'c.relnamespace')
          .leftJoin('pg_catalog.pg_attrdef as d', (join) =>
            join
              .onRef('d.adrelid', '=', 'a.attrelid')
              .onRef('d.adnum', '=', 'a.attnum')
          )
          .select([
            'n.nspname as schema',
            'c.relname as table',
            'a.attname as column',
            (eb) => eb('at.typelem', '=', eb.ref('e.oid')).as('isArray'),
            sql<string | null>`pg_get_expr(d.adbin, d.adrelid)`.as('default'),
          ])
          .$narrowType<{ isArray: boolean }>()
          .where('e.typname', '=', name)
          .where('en.nspname', '=', schema)
          .where('a.attnum', '>', 0)
          .where('a.attisdropped', '=', false)
          .where('c.relkind', 'in', ['r', 'p'])
          .where('c.relispartition', '=', false)
          .execute(),
      sqlite: () => Promise.resolve([]),
    },
    type: enumDependentType.array(),
  })

export const enumDependentsQueryOptions = ({
  connectionResource,
  name,
  schema,
}: {
  connectionResource: ConnectionResource
  name: string
  schema: string
}) =>
  queryOptions({
    queryFn: async () =>
      dependentsQuery({ name, schema }).run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: [
      'connection-resource',
      connectionResource.id,
      'enum-dependents',
      schema,
      name,
    ],
  })
