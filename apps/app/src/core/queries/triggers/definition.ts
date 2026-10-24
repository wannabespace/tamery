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

import type { triggersType } from './list'

type TriggerItem = typeof triggersType.infer

const triggerDefinitionQuery = ({ name, oid, schema }: TriggerItem) =>
  createQuery({
    query: {
      clickhouse: unsupported('Triggers'),
      mongodb: unsupported('Triggers'),
      mssql: readDefinition(mssqlObjectDefinition(schema, name)),
      mysql: async (db) => {
        const { rows } = await sql<Record<string, string>>`
          SHOW CREATE TRIGGER ${sql.id(schema, name)}
        `.execute(db)

        return { definition: rows[0]?.['SQL Original Statement'] ?? null }
      },
      oracle: async (db) => ({
        definition: await plsqlUnit.definition(db, {
          name,
          schema,
          type: 'TRIGGER',
        }),
      }),
      postgres: (db) => {
        if (oid === undefined) {
          throw new Error(`Trigger "${name}" has no oid`)
        }

        return readDefinition(sql`pg_get_triggerdef(${sql.lit(oid)}, true)`)(db)
      },
      sqlite: async (db) => {
        const row = await db
          .selectFrom('sqlite_schema')
          .select('sql as definition')
          .where('type', '=', 'trigger')
          .where('name', '=', name)
          .executeTakeFirst()

        return { definition: row?.definition ?? null }
      },
    },
    type: definitionType,
  })

export const triggerDefinitionQueryOptions = ({
  connectionResource,
  item,
}: {
  connectionResource: ConnectionResource
  item: TriggerItem
}) =>
  queryOptions({
    queryFn: async () =>
      triggerDefinitionQuery(item).run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: [
      'connection-resource',
      connectionResource.id,
      'trigger-definition',
      item.schema,
      item.table,
      item.name,
    ],
  })
