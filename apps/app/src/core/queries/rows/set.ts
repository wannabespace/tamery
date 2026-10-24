import type { ColumnTypes } from '@tamery/connection/queries/value-binding'
import type { Kysely } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { BindValue } from './shape'
import {
  bindRow,
  bindValue,
  clickhouseWrite,
  matchesPrimaryKeys,
  mongodbDocument,
} from './shape'

interface SetParams {
  schema: string
  table: string
  columns: ColumnTypes
  primaryKeys: Record<string, unknown>
  /** An `undefined` value sets the column's DEFAULT. */
  values: Record<string, unknown>
}

const updateRow = (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  bind: BindValue,
  { schema, table, columns, primaryKeys, values }: SetParams
) =>
  db
    .withSchema(schema)
    .$extendTables<Record<string, Record<string, unknown>>>()
    .updateTable(table)
    .set(bindRow(bind, columns, values))
    .where((eb) => matchesPrimaryKeys(eb, bind, columns, primaryKeys))
    .execute()

export const setQuery = (params: SetParams) =>
  createQuery({
    query: {
      clickhouse: (db) =>
        clickhouseWrite((bind) => updateRow(db, bind, params)),
      mongodb: (db) =>
        db
          .collection(params.table)
          .updateOne(mongodbDocument(params.columns, params.primaryKeys), {
            $set: mongodbDocument(params.columns, params.values),
          }),
      mssql: (db) => updateRow(db, bindValue.mssql, params),
      mysql: (db) => updateRow(db, bindValue.mysql, params),
      oracle: (db) => updateRow(db, bindValue.oracle, params),
      postgres: (db) => updateRow(db, bindValue.postgres, params),
      sqlite: (db) => updateRow(db, bindValue.sqlite, params),
    },
  })
