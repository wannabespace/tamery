import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import type { Database as MssqlDatabase } from '~/core/runtime/dialects/mssql/schema'

export const mssqlIndexes = (db: Kysely<MssqlDatabase>) =>
  db
    .selectFrom('sys.indexes as i')
    .innerJoin('sys.tables as t', 't.object_id', 'i.object_id')
    .innerJoin('sys.schemas as s', 's.schema_id', 't.schema_id')
    .innerJoin('sys.index_columns as ic', (join) =>
      join
        .onRef('ic.object_id', '=', 'i.object_id')
        .onRef('ic.index_id', '=', 'i.index_id')
    )
    .innerJoin('sys.columns as c', (join) =>
      join
        .onRef('c.object_id', '=', 'ic.object_id')
        .onRef('c.column_id', '=', 'ic.column_id')
    )
    .select([
      's.name as schema',
      't.name as table',
      'i.name as name',
      'c.name as column',
      'i.is_unique as is_unique',
      'i.is_primary_key as is_primary',
      'i.is_unique_constraint as is_constraint',
      'i.type_desc as index_type',
      'i.filter_definition as predicate',
      (eb) =>
        eb
          .case()
          .when(
            eb.or([
              eb('i.type_desc', '!=', 'NONCLUSTERED'),
              eb('i.has_filter', '=', true),
              eb('i.is_disabled', '=', true),
              eb('i.ignore_dup_key', '=', true),
              eb('i.is_padded', '=', true),
              eb('i.fill_factor', '!=', 0),
              eb('i.allow_row_locks', '=', false),
              eb('i.allow_page_locks', '=', false),
              eb.exists(
                eb
                  .selectFrom('sys.partitions as p')
                  .select(sql.lit(1).as('one'))
                  .whereRef('p.object_id', '=', 'i.object_id')
                  .whereRef('p.index_id', '=', 'i.index_id')
                  .where('p.data_compression', '!=', 0)
              ),
              eb.exists(
                eb
                  .selectFrom('sys.stats as st')
                  .select(sql.lit(1).as('one'))
                  .whereRef('st.object_id', '=', 'i.object_id')
                  .whereRef('st.stats_id', '=', 'i.index_id')
                  .where('st.no_recompute', '=', true)
              ),
              eb.not(
                eb.exists(
                  eb
                    .selectFrom('sys.data_spaces as ds')
                    .select(sql.lit(1).as('one'))
                    .whereRef('ds.data_space_id', '=', 'i.data_space_id')
                    .where('ds.is_default', '=', true)
                )
              ),
              eb.exists(
                eb
                  .selectFrom('sys.index_columns as x')
                  .select(sql.lit(1).as('one'))
                  .whereRef('x.object_id', '=', 'i.object_id')
                  .whereRef('x.index_id', '=', 'i.index_id')
                  .where((sub) =>
                    sub.or([
                      sub('x.is_included_column', '=', true),
                      sub('x.is_descending_key', '=', true),
                    ])
                  )
              ),
            ])
          )
          .then(1)
          .else(0)
          .end()
          .as('is_custom'),
    ])
    .where('i.name', 'is not', null)
    .$narrowType<{ is_custom: 1 | 0; name: string }>()
    .where('ic.is_included_column', '=', false)
    .orderBy('ic.key_ordinal')
    .execute()
