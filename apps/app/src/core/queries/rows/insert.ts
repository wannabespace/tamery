import type { ColumnTypes } from '@tamery/connection/queries/value-binding'
import type { InsertQueryBuilder, Kysely } from 'kysely'
import { sql } from 'kysely'

import { createQuery } from '~/core/runtime/query'

import type { BindValue } from './shape'
import { bindRow, bindValue, clickhouseWrite, mongodbDocument } from './shape'

interface InsertParams {
  schema: string
  table: string
  columns: ColumnTypes
  /** A missing or `undefined` value is the column's DEFAULT. */
  rows: Record<string, unknown>[]
}

// oxlint-disable-next-line ts/no-explicit-any
type Into = InsertQueryBuilder<any, any, any>

const definedValues = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined)
  )

const intoTable = (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  { schema, table }: Pick<InsertParams, 'schema' | 'table'>
) =>
  db
    .withSchema(schema)
    .$extendTables<Record<string, Record<string, unknown>>>()
    .insertInto(table)

const insertRows = (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  bind: BindValue,
  // Writes one row only.
  insertDefaultRow: (into: Into) => Into,
  params: InsertParams
) => {
  const into = intoTable(db, params)
  const values = params.rows.map((row) =>
    bindRow(bind, params.columns, definedValues(row))
  )

  return (
    values.some((row) => Object.keys(row).length > 0)
      ? into.values(values)
      : insertDefaultRow(into)
  ).execute()
}

// ClickHouse 21.12 rejects `DEFAULT` in VALUES, so each group lists only the columns its rows set and the server fills the rest.
const insertClickhouseRows = async (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  params: InsertParams
) => {
  const groups = Map.groupBy(params.rows, (row) =>
    Object.keys(definedValues(row)).toSorted().join('\0')
  )
  for (const [columns, rows] of groups) {
    // oxlint-disable-next-line no-await-in-loop
    await (columns === ''
      ? sql`insert into ${sql.id(params.schema, params.table)} format JSONEachRow ${sql.raw(rows.map(() => '{}').join('\n'))}`.execute(
          db
        )
      : clickhouseWrite((bind) =>
          intoTable(db, params)
            .values(
              rows.map((row) =>
                bindRow(bind, params.columns, definedValues(row))
              )
            )
            .execute()
        ))
  }
}

export const insertQuery = (params: InsertParams) =>
  createQuery({
    query: {
      clickhouse: (db) => insertClickhouseRows(db, params),
      mongodb: (db) =>
        db
          .collection(params.table)
          .insertMany(
            params.rows.map((row) => mongodbDocument(params.columns, row))
          ),
      mssql: (db) =>
        insertRows(db, bindValue.mssql, (into) => into.defaultValues(), params),
      mysql: (db) =>
        insertRows(db, bindValue.mysql, (into) => into.values({}), params),
      // Oracle before 23ai has neither multi-row VALUES nor DEFAULT VALUES.
      oracle: async (db) => {
        for (const row of params.rows) {
          // oxlint-disable-next-line no-await-in-loop
          await insertRows(
            db,
            bindValue.oracle,
            (into) =>
              into.values(
                Object.fromEntries(
                  params.columns.map(({ id }) => [id, sql`default`])
                )
              ),
            { ...params, rows: [row] }
          )
        }
      },
      postgres: (db) =>
        insertRows(
          db,
          bindValue.postgres,
          (into) => into.defaultValues(),
          params
        ),
      sqlite: (db) =>
        insertRows(
          db,
          bindValue.sqlite,
          (into) => into.defaultValues(),
          params
        ),
    },
  })
