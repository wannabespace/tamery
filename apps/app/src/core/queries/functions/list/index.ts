import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'
import { queryOptions } from '@tanstack/react-query'
import { type } from 'arktype'
import { sql } from 'kysely'

import { getCapabilities } from '~/core/catalog/capabilities'
import type { ConnectionResource } from '~/core/connection/sync'
import { mssqlModuleParts } from '~/core/queries/shared/definition'
import {
  connectionResourceToQueryParams,
  createQuery,
} from '~/core/runtime/query'

import { oracleFunctions } from './oracle'

const mssqlType = sql<string>`TYPE_NAME(pa.user_type_id)`

// Without its length or precision a parameter comes back as varchar(1) or decimal(18,0).
const mssqlParameterType = sql<string>`CONCAT(${mssqlType}, CASE
  WHEN ${mssqlType} IN ('varchar', 'varbinary', 'char', 'binary') THEN CONCAT('(', IIF(pa.max_length = -1, 'max', CAST(pa.max_length AS varchar(10))), ')')
  WHEN ${mssqlType} IN ('nvarchar', 'nchar') THEN CONCAT('(', IIF(pa.max_length = -1, 'max', CAST(pa.max_length / 2 AS varchar(10))), ')')
  WHEN ${mssqlType} IN ('decimal', 'numeric') THEN CONCAT('(', pa.precision, ',', pa.scale, ')')
  WHEN ${mssqlType} IN ('datetime2', 'datetimeoffset', 'time') THEN CONCAT('(', pa.scale, ')')
  ELSE ''
END)`

// A parameter default, a READONLY parameter and every WITH option live in the
// header text alone, so a signature rebuilt from the catalog would drop them.
const mssqlHeaderOptions = /[=]|\bREADONLY\b|\bWITH\b/iu
const mssqlSchemaBindingOnly = /\bWITH\s+SCHEMABINDING(?=\s+AS\s*$)/iu

// GROUP_CONCAT silently truncates at group_concat_max_len; a capped signature must read as unreadable.
const mysqlArguments = sql<string | null>`(
  SELECT GROUP_CONCAT(
    CONCAT_WS(' ', NULLIF(pm.PARAMETER_MODE, 'IN'), pm.PARAMETER_NAME, pm.DTD_IDENTIFIER)
    ORDER BY pm.ORDINAL_POSITION SEPARATOR ', '
  )
  FROM information_schema.PARAMETERS pm
  WHERE pm.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA
    AND pm.SPECIFIC_NAME = r.ROUTINE_NAME
    AND pm.ROUTINE_TYPE = r.ROUTINE_TYPE
    AND pm.ORDINAL_POSITION > 0
)`

export const functionsType = type({
  'args?': 'string | null',
  'behavior?': 'string | null',
  'body?': 'string | null',
  'custom?': 'boolean | 1 | 0',
  'extras?': 'string | null',
  'identity?': 'string',
  'inline?': 'boolean | 1 | 0',
  'language?': 'string',
  name: 'string',
  'oid?': 'number',
  return_type: 'string | null',
  schema: 'string',
  'schema_bound?': 'boolean | null',
  'security_definer?': 'boolean',
  type: '"function" | "procedure"',
}).pipe(({ custom, inline, schema_bound, security_definer, ...item }) => ({
  ...item,
  args: item.args ?? null,
  behavior: item.behavior || '',
  body: item.body || '',
  custom: !!custom,
  extras: item.extras || '',
  inline: !!inline,
  language: item.language || null,
  schemaBound: !!schema_bound,
  securityDefiner: security_definer ?? false,
}))

const resourceFunctionsQuery = createQuery({
  query: {
    clickhouse: unsupported('Functions'),
    mongodb: unsupported('Functions'),
    mssql: async (db) => {
      const rows = await db
        .selectFrom('sys.objects as o')
        .innerJoin('sys.schemas as s', 'o.schema_id', 's.schema_id')
        .leftJoin('sys.sql_modules as sm', 'o.object_id', 'sm.object_id')
        .select([
          's.name as schema',
          'o.name as name',
          sql<string>`COALESCE((
            SELECT STRING_AGG(CONCAT(pa.name, ' ', ${mssqlParameterType}, IIF(pa.is_output = 1, ' OUTPUT', '')), ', ')
              WITHIN GROUP (ORDER BY pa.parameter_id)
            FROM sys.parameters pa
            WHERE pa.object_id = o.object_id AND pa.parameter_id > 0
          ), '')`.as('args'),
          'sm.definition as body',
          'sm.is_schema_bound as schema_bound',
          sql<1 | 0>`IIF(o.type = 'IF', 1, 0)`.as('inline'),
          sql<
            'function' | 'procedure'
          >`IIF(o.type IN ('P', 'PC'), 'procedure', 'function')`.as('type'),
          sql<string>`IIF(o.type IN ('FS', 'FT', 'PC'), 'CLR', 'SQL')`.as(
            'language'
          ),
          sql<string | null>`CASE
            WHEN o.type = 'FN' THEN (SELECT ${mssqlParameterType} FROM sys.parameters pa WHERE pa.object_id = o.object_id AND pa.parameter_id = 0)
            WHEN o.type IN ('IF', 'TF') THEN 'table'
          END`.as('return_type'),
        ])
        .where('o.type', 'in', ['FN', 'IF', 'TF', 'FS', 'FT', 'P', 'PC'])
        .where('o.is_ms_shipped', '=', false)
        .where('s.name', 'not in', ['sys', 'INFORMATION_SCHEMA'])
        .execute()

      return rows.map((row) => {
        const module = mssqlModuleParts(row.body)

        return {
          ...row,
          body: module?.body ?? null,
          custom: mssqlHeaderOptions.test(
            (module?.header ?? '').replace(mssqlSchemaBindingOnly, '')
          ),
        }
      })
    },
    mysql: (db) =>
      db
        .selectFrom('information_schema.ROUTINES as r')
        .select([
          'r.ROUTINE_SCHEMA as schema',
          'r.ROUTINE_NAME as name',
          sql<'function' | 'procedure'>`LOWER(r.ROUTINE_TYPE)`.as('type'),
          sql<
            string | null
          >`CASE WHEN LENGTH(${mysqlArguments}) >= @@group_concat_max_len THEN NULL ELSE COALESCE(${mysqlArguments}, '') END`.as(
            'args'
          ),
          'r.ROUTINE_DEFINITION as body',
          (eb) =>
            eb
              .case('r.IS_DETERMINISTIC')
              .when('YES')
              .then('DETERMINISTIC')
              .else('NOT DETERMINISTIC')
              .end()
              .as('behavior'),
          sql<string>`CONCAT_WS(' ',
            r.SQL_DATA_ACCESS,
            CONCAT('SQL SECURITY ', r.SECURITY_TYPE),
            CASE WHEN r.ROUTINE_COMMENT <> '' THEN CONCAT('COMMENT ', QUOTE(r.ROUTINE_COMMENT)) END
          )`.as('extras'),
          (eb) =>
            eb
              .case('r.ROUTINE_TYPE')
              .when('FUNCTION')
              .thenRef('r.DTD_IDENTIFIER')
              .end()
              .as('return_type'),
        ])
        .where(
          'r.ROUTINE_SCHEMA',
          'not in',
          getCapabilities(Dialect.MySQL).systemSchemas
        )
        .execute(),
    oracle: oracleFunctions,
    postgres: (db) =>
      db
        .selectFrom('pg_catalog.pg_proc as p')
        .innerJoin('pg_catalog.pg_namespace as n', 'p.pronamespace', 'n.oid')
        .innerJoin('pg_catalog.pg_language as l', 'p.prolang', 'l.oid')
        .select([
          'n.nspname as schema',
          'p.proname as name',
          (eb) =>
            eb
              .case('p.prokind')
              .when('p')
              .then('procedure')
              .else('function')
              .end()
              .as('type'),
          'l.lanname as language',
          sql<string>`pg_get_function_result(p.oid)`.as('return_type'),
          sql<string>`pg_get_function_arguments(p.oid)`.as('args'),
          'p.prosrc as body',
          'p.prosecdef as security_definer',
          (eb) =>
            eb
              .case('p.provolatile')
              .when('i')
              .then('IMMUTABLE')
              .when('s')
              .then('STABLE')
              .else('VOLATILE')
              .end()
              .as('behavior'),
          sql<string>`TRIM(CONCAT_WS(' ',
            CASE WHEN p.prokind <> 'p' THEN CONCAT_WS(' ',
              CASE WHEN p.proisstrict THEN 'STRICT' END,
              CASE WHEN p.proleakproof THEN 'LEAKPROOF' END,
              CASE p.proparallel WHEN 's' THEN 'PARALLEL SAFE' WHEN 'r' THEN 'PARALLEL RESTRICTED' END,
              CONCAT('COST ', p.procost::text),
              CASE WHEN p.proretset THEN CONCAT('ROWS ', p.prorows::text) END
            ) END,
            (
              SELECT string_agg(
                CONCAT('SET ', split_part(cfg, '=', 1), ' TO ', quote_literal(substr(cfg, strpos(cfg, '=') + 1))),
                ' '
              )
              FROM unnest(COALESCE(p.proconfig, '{}')) AS cfg
            )
          ))`.as('extras'),
          'p.oid as oid',
          sql<string>`pg_get_function_identity_arguments(p.oid)`.as('identity'),
        ])
        .$narrowType<{ type: 'function' | 'procedure' }>()
        .where('n.nspname', 'not like', 'pg_%')
        .where('n.nspname', '!=', 'information_schema')
        .where('p.prokind', '!=', 'a')
        .where(
          sql<boolean>`NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_catalog.pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`
        )
        .execute(),
    sqlite: unsupported('Functions'),
  },
  type: functionsType.array(),
})

export const resourceFunctionsQueryOptions = ({
  connectionResource,
}: {
  connectionResource: ConnectionResource
}) =>
  queryOptions({
    queryFn: async () =>
      resourceFunctionsQuery.run(
        await connectionResourceToQueryParams(connectionResource)
      ),
    queryKey: ['connection-resource', connectionResource.id, 'functions'],
  })
