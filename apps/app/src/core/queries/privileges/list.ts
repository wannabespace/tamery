import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { ConnectionResource } from '~/core/connection/sync'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { ALL_TABLES } from './shape'

export const privilegeType = type({
  grantable: 'boolean',
  grantee: 'string',
  name: 'string',
  privilege: 'string',
  schema: 'string',
  table: 'string',
})

const query = createQuery({
  query: {
    clickhouse: unsupported('Privileges'),
    mongodb: unsupported('Privileges'),
    mssql: unsupported('Privileges'),
    mysql: async (db) => {
      const [onSchemas, onTables] = await Promise.all([
        db
          .selectFrom('information_schema.SCHEMA_PRIVILEGES')
          .select([
            'GRANTEE as grantee',
            'TABLE_SCHEMA as schema',
            'PRIVILEGE_TYPE as privilege',
            'IS_GRANTABLE as grantable',
          ])
          .where(
            'TABLE_SCHEMA',
            'not in',
            getCapabilities(Dialect.MySQL).systemSchemas
          )
          .execute(),
        db
          .selectFrom('information_schema.TABLE_PRIVILEGES')
          .select([
            'GRANTEE as grantee',
            'TABLE_SCHEMA as schema',
            'TABLE_NAME as table',
            'PRIVILEGE_TYPE as privilege',
            'IS_GRANTABLE as grantable',
          ])
          .where(
            'TABLE_SCHEMA',
            'not in',
            getCapabilities(Dialect.MySQL).systemSchemas
          )
          .execute(),
      ])

      return [
        ...onSchemas.map((row) => ({ ...row, table: ALL_TABLES })),
        ...onTables,
      ].map((row) => ({
        ...row,
        grantable: row.grantable === 'YES',
        name: `${row.privilege} for ${row.grantee}`,
      }))
    },
    oracle: unsupported('Privileges'),
    postgres: unsupported('Privileges'),
    sqlite: unsupported('Privileges'),
  },
  type: privilegeType.array(),
})

export const resourcePrivilegesQueryOptions = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) =>
  queryOptions({
    queryFn: async () =>
      query.run(await connectionResourceToQueryParams(connectionResource)),
    queryKey: ['connection-resource', connectionResource.id, 'privileges'],
  })
