import { Dialect } from '@tamery/shared/enums/connection-type'
import type { CreateTableBuilder, Kysely } from 'kysely'
import { sql } from 'kysely'

import { COLUMN_TYPE_CAPABILITIES } from '~/core/catalog/column-types'
import { suggestedName } from '~/core/catalog/engine-name'
import {
  identifiers,
  mssqlQualified,
} from '~/core/queries/shared/sql-fragments'

export type DraftState = 'added' | 'changed' | 'dropped'

export interface NewColumn {
  name: string
  nullable: boolean
  primaryKey: boolean
  type: string
}

export interface ColumnDefinition {
  attributes: string
  collation: string | null
  comment: string | null
  nullable: boolean
  type: string
}

export type ColumnsFilter = { schema: string; table: string } | null

interface TableTarget {
  schema: string
  table: string
}

interface ColumnTarget extends TableTarget {
  column: string
}

export interface AlterColumnTarget extends ColumnTarget {
  nullable: boolean
  original: ColumnDefinition
  type: string
}

// oxlint-disable-next-line ts/no-explicit-any
export type Db = Kysely<any>

const LOW_CARDINALITY = 'LowCardinality('

// ClickHouse needs Nullable() inside LowCardinality(), never around it.
export const clickhouseColumnType = ({
  nullable,
  type: columnType,
}: Pick<NewColumn, 'nullable' | 'type'>) => {
  if (
    !nullable ||
    COLUMN_TYPE_CAPABILITIES[Dialect.ClickHouse].neverNullable?.test(columnType)
  ) {
    return columnType
  }
  return columnType.startsWith(LOW_CARDINALITY)
    ? `${LOW_CARDINALITY}Nullable(${columnType.slice(LOW_CARDINALITY.length, -1)}))`
    : `Nullable(${columnType})`
}

export const createTableStatement = (
  dialect: Dialect,
  db: Db,
  { columns, schema, table }: TableTarget & { columns: NewColumn[] }
) => {
  const keys = columns.filter((column) => column.primaryKey)
  let create: CreateTableBuilder<string, string> = db
    .withSchema(schema)
    .schema.createTable(table)

  if (dialect === Dialect.ClickHouse) {
    for (const column of columns) {
      create = create.addColumn(
        column.name,
        sql.raw(clickhouseColumnType(column))
      )
    }
    const order = keys.length
      ? sql`(${identifiers(keys.map((key) => key.name))})`
      : sql`tuple()`

    return create.modifyEnd(sql`ENGINE = MergeTree ORDER BY ${order}`).compile()
  }

  const singleKey = keys.length === 1

  for (const column of columns) {
    create = create.addColumn(
      column.name,
      sql.raw(column.type),
      (definition) => {
        const keyed =
          singleKey && column.primaryKey ? definition.primaryKey() : definition
        return column.nullable ? keyed : keyed.notNull()
      }
    )
  }

  if (keys.length > 1) {
    create = create.addPrimaryKeyConstraint(
      suggestedName(dialect, [table, 'pkey']),
      keys.map((key) => key.name)
    )
  }

  return create.compile()
}

export const renameTableStatement = (
  dialect: Dialect,
  db: Db,
  { newName, schema, table }: TableTarget & { newName: string }
) => {
  // MySQL's ALTER TABLE refuses a view; RENAME TABLE takes both.
  if (dialect === Dialect.ClickHouse || dialect === Dialect.MySQL) {
    return sql`RENAME TABLE ${sql.id(schema, table)} TO ${sql.id(schema, newName)}`.compile(
      db
    )
  }

  if (dialect === Dialect.MSSQL) {
    return sql`EXEC sp_rename ${sql.val(mssqlQualified(schema, table))}, ${sql.val(newName)}`.compile(
      db
    )
  }

  return db
    .withSchema(schema)
    .schema.alterTable(table)
    .renameTo(newName)
    .compile()
}

export const dropTableStatement = (
  dialect: Dialect,
  db: Db,
  { cascade, schema, table }: TableTarget & { cascade: boolean }
) => {
  const drop = db.withSchema(schema).schema.dropTable(table)

  return (
    cascade && dialect === Dialect.Postgres ? drop.cascade() : drop
  ).compile()
}

export const addColumnStatement = (
  dialect: Dialect,
  db: Db,
  { column, schema, table }: TableTarget & { column: NewColumn }
) => {
  const alter = db.withSchema(schema).schema.alterTable(table)

  if (dialect === Dialect.ClickHouse) {
    return alter
      .addColumn(column.name, sql.raw(clickhouseColumnType(column)))
      .compile()
  }

  return alter
    .addColumn(column.name, sql.raw(column.type), (definition) =>
      column.nullable ? definition : definition.notNull()
    )
    .compile()
}

export const mssqlDefaultConstraint = ({
  column,
  schema,
  table,
}: ColumnTarget) => {
  const qualified = mssqlQualified(schema, table)

  return {
    drop: sql`DECLARE @default nvarchar(max), @definition nvarchar(max), @statement nvarchar(max);
SELECT @default = QUOTENAME(name), @definition = definition FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(${qualified}) AND parent_column_id = COLUMNPROPERTY(OBJECT_ID(${qualified}), ${column}, 'ColumnId');
SET @statement = N'ALTER TABLE ' + ${qualified} + N' DROP CONSTRAINT ' + @default;
IF @statement IS NOT NULL EXEC sp_executesql @statement;
`,
    restore: sql`;
SET @statement = N'ALTER TABLE ' + ${qualified} + N' ADD CONSTRAINT ' + @default + N' DEFAULT ' + @definition + N' FOR ' + ${mssqlQualified(column)};
IF @statement IS NOT NULL EXEC sp_executesql @statement;`,
  }
}

export const dropColumnStatement = (
  dialect: Dialect,
  db: Db,
  target: ColumnTarget
) => {
  const { column, schema, table } = target

  if (dialect === Dialect.MSSQL) {
    return sql`${mssqlDefaultConstraint(target).drop}ALTER TABLE ${sql.id(schema, table)} DROP COLUMN ${sql.id(column)}`.compile(
      db
    )
  }

  return db
    .withSchema(schema)
    .schema.alterTable(table)
    .dropColumn(column)
    .compile()
}

export const renameColumnStatement = (
  dialect: Dialect,
  db: Db,
  {
    column,
    newName,
    schema,
    table,
  }: TableTarget & {
    column: string
    newName: string
  }
) => {
  if (dialect === Dialect.MSSQL) {
    return sql`EXEC sp_rename ${sql.val(mssqlQualified(schema, table, column))}, ${sql.val(newName)}, 'COLUMN'`.compile(
      db
    )
  }

  return db
    .withSchema(schema)
    .schema.alterTable(table)
    .renameColumn(column, newName)
    .compile()
}
