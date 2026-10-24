import { SQLITE_RESOURCE_NAME } from '@tamery/connection/utils'
import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { sql } from 'kysely'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { ConnectionResource } from '~/core/connection/sync'
import { mssqlModuleBody } from '~/core/queries/shared/definition'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { sqliteTriggerParts } from '../shape'
import { oracleTriggers } from './oracle'

export const triggersType = type({
  'body?': 'string | null',
  'custom?': 'boolean | 1 | 0',
  'enabled?': 'boolean | 1 | 0',
  'enabled_mode?': 'string',
  event: 'string',
  'function_name?': 'string | null',
  'function_schema?': 'string | null',
  name: 'string',
  'oid?': 'number',
  'orientation?': 'string',
  schema: 'string',
  table: 'string',
  timing: 'string',
}).pipe(
  ({
    body,
    custom,
    enabled,
    enabled_mode,
    function_name,
    function_schema,
    orientation,
    ...item
  }) => ({
    ...item,
    body: body ?? null,
    custom: !!custom,
    enabled: enabled === undefined ? null : !!enabled,
    enabledMode: enabled_mode || 'O',
    functionName: function_name || null,
    functionSchema: function_schema || null,
    orientation:
      orientation === 'ROW' ? ('ROW' as const) : ('STATEMENT' as const),
  })
)

const resourceTriggersQuery = createQuery({
  query: {
    clickhouse: unsupported('Triggers'),
    mongodb: unsupported('Triggers'),
    mssql: async (db) => {
      const rows = await db
        .selectFrom('sys.triggers as t')
        .innerJoin('sys.objects as o', 't.parent_id', 'o.object_id')
        .innerJoin('sys.schemas as s', 'o.schema_id', 's.schema_id')
        .leftJoin('sys.trigger_events as te', 't.object_id', 'te.object_id')
        .leftJoin('sys.sql_modules as sm', 't.object_id', 'sm.object_id')
        .select([
          's.name as schema',
          'o.name as table',
          't.name as name',
          sql<string>`COALESCE(STRING_AGG(te.type_desc, ' OR '), 'UNKNOWN')`.as(
            'event'
          ),
          (eb) =>
            eb
              .case()
              .when('t.is_instead_of_trigger', '=', true)
              .then('INSTEAD OF')
              .else('AFTER')
              .end()
              .as('timing'),
          'sm.definition as body',
          (eb) =>
            eb
              .case()
              .when('t.is_disabled', '=', false)
              .then(1)
              .else(0)
              .end()
              .as('enabled'),
          (eb) =>
            eb
              .case()
              .when(
                eb.or([
                  eb('t.is_not_for_replication', '=', true),
                  eb('sm.is_schema_bound', '=', true),
                  eb('sm.execute_as_principal_id', 'is not', null),
                ])
              )
              .then(1)
              .else(0)
              .end()
              .as('custom'),
        ])
        .$narrowType<{ custom: 1 | 0; enabled: 1 | 0 }>()
        .where('t.is_ms_shipped', '=', false)
        .where('t.parent_class', '=', 1)
        .where('s.name', '!=', 'sys')
        .groupBy([
          's.name',
          'o.name',
          't.name',
          't.is_instead_of_trigger',
          't.is_disabled',
          't.is_not_for_replication',
          'sm.definition',
          'sm.is_schema_bound',
          'sm.execute_as_principal_id',
        ])
        .execute()

      return rows.map((row) => ({ ...row, body: mssqlModuleBody(row.body) }))
    },
    mysql: (db) =>
      db
        .selectFrom('information_schema.TRIGGERS as t')
        .select([
          't.TRIGGER_SCHEMA as schema',
          't.EVENT_OBJECT_TABLE as table',
          't.TRIGGER_NAME as name',
          't.EVENT_MANIPULATION as event',
          't.ACTION_TIMING as timing',
          't.ACTION_ORIENTATION as orientation',
          't.ACTION_STATEMENT as body',
          (eb) =>
            eb
              .exists(
                eb
                  .selectFrom('information_schema.TRIGGERS as later')
                  .select(sql.lit(1).as('one'))
                  .whereRef(
                    'later.EVENT_OBJECT_SCHEMA',
                    '=',
                    't.EVENT_OBJECT_SCHEMA'
                  )
                  .whereRef(
                    'later.EVENT_OBJECT_TABLE',
                    '=',
                    't.EVENT_OBJECT_TABLE'
                  )
                  .whereRef(
                    'later.EVENT_MANIPULATION',
                    '=',
                    't.EVENT_MANIPULATION'
                  )
                  .whereRef('later.ACTION_TIMING', '=', 't.ACTION_TIMING')
                  .whereRef('later.ACTION_ORDER', '>', 't.ACTION_ORDER')
              )
              .as('custom'),
        ])
        .where(
          't.TRIGGER_SCHEMA',
          'not in',
          getCapabilities(Dialect.MySQL).systemSchemas
        )
        .execute(),
    oracle: oracleTriggers,
    postgres: (db) =>
      db
        .selectFrom('pg_catalog.pg_trigger as t')
        .innerJoin('pg_catalog.pg_class as c', 't.tgrelid', 'c.oid')
        .innerJoin('pg_catalog.pg_namespace as n', 'c.relnamespace', 'n.oid')
        .leftJoin('pg_catalog.pg_proc as p', 't.tgfoid', 'p.oid')
        .leftJoin('pg_catalog.pg_namespace as fn', 'p.pronamespace', 'fn.oid')
        .select((eb) => {
          const typeHas = (bit: number) =>
            eb(eb(eb.cast<number>('t.tgtype', 'integer'), '&', bit), '!=', 0)
          const eventWhenSet = (bit: number, event: string) =>
            eb.case().when(typeHas(bit)).then(event).end()
          const triggerDefinition = eb.fn<string>('pg_get_triggerdef', [
            't.oid',
          ])

          return [
            'n.nspname as schema',
            'c.relname as table',
            't.tgname as name',
            eb
              .fn<string>('nullif', [
                eb.fn('concat_ws', [
                  eb.val(' OR '),
                  eventWhenSet(4, 'INSERT'),
                  eventWhenSet(8, 'DELETE'),
                  eventWhenSet(16, 'UPDATE'),
                  eventWhenSet(32, 'TRUNCATE'),
                ]),
                eb.val(''),
              ])
              .as('event'),
            eb
              .case()
              .when(typeHas(2))
              .then('BEFORE')
              .when(typeHas(64))
              .then('INSTEAD OF')
              .else('AFTER')
              .end()
              .as('timing'),
            eb('t.tgenabled', '!=', 'D').as('enabled'),
            eb
              .case()
              .when(typeHas(1))
              .then('ROW')
              .else('STATEMENT')
              .end()
              .as('orientation'),
            'p.proname as function_name',
            'fn.nspname as function_schema',
            't.tgenabled as enabled_mode',
            eb
              .or([
                eb('t.tgconstraint', '<>', 0),
                eb('t.tgnargs', '>', 0),
                eb('t.tgqual', 'is not', null),
                eb(triggerDefinition, 'like', '%UPDATE OF %'),
                eb(triggerDefinition, 'like', '%REFERENCING %'),
              ])
              .as('custom'),
            't.oid as oid',
          ]
        })
        .where('t.tgisinternal', '=', false)
        .where('n.nspname', 'not like', 'pg_%')
        .where('n.nspname', '!=', 'information_schema')
        .execute(),
    sqlite: async (db) => {
      const rows = await db
        .selectFrom('sqlite_schema')
        .select((eb) => [
          eb.val(SQLITE_RESOURCE_NAME).as('schema'),
          'name',
          'tbl_name as table',
          'sql as statement',
        ])
        .$narrowType<{ statement: string }>()
        .where('type', '=', 'trigger')
        .execute()

      return rows.map(({ statement, ...row }) => ({
        ...row,
        ...sqliteTriggerParts(statement),
        orientation: 'ROW',
      }))
    },
  },
  type: triggersType.array(),
})

export const resourceTriggersQueryOptions = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) =>
  queryOptions({
    queryFn: async () =>
      resourceTriggersQuery.run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: ['connection-resource', connectionResource.id, 'triggers'],
  })
