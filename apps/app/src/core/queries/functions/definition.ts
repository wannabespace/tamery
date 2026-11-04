import { unsupported } from '@tamery/shared/unsupported'
import { queryOptions } from '@tanstack/react-query'
import { sql } from 'kysely'

import type { ConnectionResource } from '~/core/connection/sync'
import {
  definitionType,
  mssqlObjectDefinition,
  readDefinition,
} from '~/core/queries/shared/definition'
import { plsqlUnit } from '~/core/queries/shared/plsql'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import type { functionsType } from './list'
import { routineType, routineKeyword } from './shape'

type FunctionItem = typeof functionsType.infer

const functionDefinitionQuery = ({
  name,
  oid,
  schema,
  type: kind,
}: FunctionItem) =>
  createQuery({
    query: {
      clickhouse: unsupported('Functions'),
      mongodb: unsupported('Functions'),
      mssql: readDefinition(mssqlObjectDefinition(schema, name)),
      mysql: async (db) => {
        const { rows } = await sql<Record<string, string>>`
          SHOW CREATE ${routineKeyword(kind)} ${sql.id(schema, name)}
        `.execute(db)
        const [row] = rows

        return {
          definition:
            row?.['Create Function'] ?? row?.['Create Procedure'] ?? null,
        }
      },
      oracle: async (db) => ({
        definition: await plsqlUnit.definition(db, {
          name,
          schema,
          type: routineType(kind),
        }),
      }),
      postgres: (db) => {
        if (oid === undefined) {
          throw new Error(`Function "${name}" has no oid`)
        }

        return readDefinition(sql`pg_get_functiondef(${sql.lit(oid)})`)(db)
      },
      sqlite: unsupported('Functions'),
    },
    type: definitionType,
  })

export const functionDefinitionQueryOptions = ({
  connectionResource,
  item,
}: {
  connectionResource: ConnectionResource
  item: FunctionItem
}) =>
  queryOptions({
    queryFn: async () =>
      functionDefinitionQuery(item).run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: [
      'connection-resource',
      connectionResource.id,
      'function-definition',
      item.schema,
      item.name,
      item.type,
      item.identity ?? '',
    ],
  })
