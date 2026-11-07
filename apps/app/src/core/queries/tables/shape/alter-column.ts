import { Dialect } from '@tamery/shared/enums/connection-type'
import type { AlterColumnBuilder } from 'kysely'
import { sql } from 'kysely'

import type { RenamedValue } from '~/core/queries/shared/inline-enum'

import type { AlterColumnTarget, Db } from '.'
import { clickhouseColumnType, mssqlDefaultConstraint } from '.'

const restatedType = ({
  original,
  type: columnType,
}: Pick<AlterColumnTarget, 'original' | 'type'>) => {
  const kept = [
    columnType === original.type &&
      original.collation &&
      `COLLATE ${original.collation}`,
    original.attributes,
  ]
    .filter(Boolean)
    .join(' ')
  return sql.raw(kept ? `${columnType} ${kept}` : columnType)
}

// MySQL drops the comment on a MODIFY or CHANGE COLUMN that does not restate it.
export const mysqlColumnDefinition = (
  target: Pick<AlterColumnTarget, 'original' | 'type'>,
  comment = target.original.comment
) =>
  sql`${restatedType(target)}${comment ? sql` COMMENT ${sql.lit(comment)}` : sql``}`

export const alterColumnStatement = (
  dialect: Dialect,
  db: Db,
  target: AlterColumnTarget
) => {
  const { column, nullable, original, schema, table, type: columnType } = target
  const retyped = columnType !== original.type
  const alter = db.withSchema(schema).schema.alterTable(table)

  if (dialect === Dialect.ClickHouse) {
    return alter
      .modifyColumn(
        column,
        sql.raw(clickhouseColumnType({ nullable, type: columnType }))
      )
      .compile()
  }

  if (dialect === Dialect.Postgres) {
    const nullability = (builder: AlterColumnBuilder) =>
      nullable ? builder.dropNotNull() : builder.setNotNull()

    if (!retyped) {
      return alter.alterColumn(column, nullability).compile()
    }

    const newType = sql.raw(columnType)
    return alter
      .alterColumn(column, (builder) =>
        builder.setDataType(sql`${newType} USING ${sql.id(column)}::${newType}`)
      )
      .alterColumn(column, nullability)
      .compile()
  }

  // Oracle refuses to restate a nullability the column already has (ORA-01442, ORA-01451), and a LOB's own type (ORA-22859).
  if (dialect === Dialect.Oracle) {
    const newType = retyped ? sql` ${sql.raw(columnType)}` : sql``
    const nullability =
      nullable === original.nullable
        ? sql``
        : sql.raw(nullable ? ' NULL' : ' NOT NULL')
    return sql`ALTER TABLE ${sql.id(schema, table)} MODIFY (${sql.id(column)}${newType}${nullability})`.compile(
      db
    )
  }

  if (dialect === Dialect.MSSQL) {
    const statement = sql`ALTER TABLE ${sql.id(schema, table)} ALTER COLUMN ${sql.id(column)} ${restatedType(target)} ${sql.raw(nullable ? 'NULL' : 'NOT NULL')}`
    if (!retyped) {
      return statement.compile(db)
    }
    const { drop, restore } = mssqlDefaultConstraint(target)
    return sql`${drop}${statement}${restore}`.compile(db)
  }

  return alter
    .modifyColumn(column, mysqlColumnDefinition(target), (builder) =>
      nullable ? builder : builder.notNull()
    )
    .compile()
}

/**
 * DuckDB takes one change per ALTER TABLE, so a retype and a nullability change are two statements. A renamed enum value
 * moves its rows in the retype, which fails on a value the new type lacks.
 */
export const duckdbAlterColumnStatements = (
  db: Db,
  {
    column,
    nullable,
    original,
    renamedValues = [],
    schema,
    table,
    type: columnType,
  }: AlterColumnTarget & { renamedValues?: RenamedValue[] }
) => {
  const alter = () => db.withSchema(schema).schema.alterTable(table)
  const text = sql`CAST(${sql.id(column)} AS VARCHAR)`
  const renames =
    renamedValues.length > 0
      ? sql` USING CASE ${text} ${sql.join(
          renamedValues.map(
            ({ from, to }) => sql`WHEN ${sql.lit(from)} THEN ${sql.lit(to)}`
          ),
          sql` `
        )} ELSE ${text} END`
      : sql``
  return [
    columnType !== original.type &&
      alter()
        .alterColumn(column, (builder) =>
          builder.setDataType(sql`${sql.raw(columnType)}${renames}`)
        )
        .compile(),
    nullable !== original.nullable &&
      alter()
        .alterColumn(column, (builder) =>
          nullable ? builder.dropNotNull() : builder.setNotNull()
        )
        .compile(),
  ].filter((statement) => statement !== false)
}
