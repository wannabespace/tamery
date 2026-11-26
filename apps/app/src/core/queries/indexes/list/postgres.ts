import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import type { Database as PostgresDatabase } from '~/core/runtime/dialects/postgres/schema'

export const postgresIndexes = (db: Kysely<PostgresDatabase>) =>
  db
    .selectFrom('pg_catalog.pg_class as t')
    .innerJoin('pg_catalog.pg_index as ix', 't.oid', 'ix.indrelid')
    .innerJoin('pg_catalog.pg_class as i', 'i.oid', 'ix.indexrelid')
    .innerJoin('pg_catalog.pg_am as am', 'i.relam', 'am.oid')
    .innerJoin('pg_catalog.pg_namespace as n', 'n.oid', 't.relnamespace')
    .crossJoinLateral(
      sql<{
        key: number
        ordinality: number
      }>`unnest(ix.indkey::int2[]) WITH ORDINALITY`.as('key')
    )
    .leftJoin('pg_catalog.pg_attribute as a', (join) =>
      join.onRef('a.attrelid', '=', 't.oid').onRef('a.attnum', '=', 'key.key')
    )
    .select([
      'n.nspname as schema',
      't.relname as table',
      'i.relname as name',
      'a.attname as column',
      (eb) =>
        eb
          .case()
          .when('key.key', '=', 0)
          .then(
            sql<string>`pg_get_indexdef(ix.indexrelid, key.ordinality::int, true)`
          )
          .end()
          .as('custom_expression'),
      'ix.indisunique as is_unique',
      'ix.indisprimary as is_primary',
      'am.amname as index_type',
      sql<string>`pg_get_indexdef(ix.indexrelid)`.as('index_definition'),
      sql<string | null>`pg_get_expr(ix.indpred, ix.indrelid, true)`.as(
        'predicate'
      ),
      sql<string | null>`(
        SELECT string_agg(ia.attname, ', ' ORDER BY inc.ordinality)
        FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS inc(attnum, ordinality)
        JOIN pg_catalog.pg_attribute ia
          ON ia.attrelid = ix.indrelid AND ia.attnum = inc.attnum
        WHERE inc.ordinality > ix.indnkeyatts
      )`.as('included_columns'),
      sql<number>`pg_relation_size(ix.indexrelid)::float8`.as('size_bytes'),
      (eb) =>
        eb
          .selectFrom('pg_catalog.pg_stat_user_indexes as st')
          .select((sub) =>
            sub.cast<number>('st.idx_scan', 'float8').as('scans')
          )
          .whereRef('st.indexrelid', '=', 'ix.indexrelid')
          .as('scans'),
      (eb) =>
        eb
          .exists(
            eb
              .selectFrom('pg_catalog.pg_constraint')
              .select(sql.lit(1).as('one'))
              .whereRef('conindid', '=', 'ix.indexrelid')
              .where('contype', 'in', ['p', 'u', 'x'])
          )
          .as('is_constraint'),
      sql<boolean>`
        am.amname <> 'btree'
        OR ix.indpred IS NOT NULL
        OR ix.indnkeyatts <> ix.indnatts
        OR 0 = ANY(ix.indkey::int2[])
        OR EXISTS (SELECT 1 FROM unnest(ix.indoption::int2[]) AS o WHERE o <> 0)
        OR COALESCE((to_jsonb(ix)->>'indnullsnotdistinct')::boolean, false)
      `.as('is_custom'),
    ])
    .where('n.nspname', 'not in', ['pg_catalog', 'information_schema'])
    .where('t.relkind', 'in', ['r', 'p', 'm'])
    .where(sql<boolean>`key.ordinality <= ix.indnkeyatts`)
    .orderBy('key.ordinality')
    .execute()
