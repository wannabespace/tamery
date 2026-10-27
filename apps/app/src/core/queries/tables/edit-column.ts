import { Dialect } from '@tamery/shared/enums/connection-type'
import { unsupported } from '@tamery/shared/unsupported'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

import type { ConstraintShape } from '~/core/queries/constraints/shape'
import {
  addConstraint,
  constraintClause,
} from '~/core/queries/constraints/shape'
import type { RenamedValue } from '~/core/queries/shared/inline-enum'
import { clickhouseEnum, mysqlEnum } from '~/core/queries/shared/inline-enum'
import { createQuery } from '~/core/runtime/query'

import type { AlterColumnTarget } from './shape'
import { renameColumnStatement } from './shape'
import {
  alterColumnStatement,
  mysqlColumnDefinition,
} from './shape/alter-column'

interface EditColumnTarget extends AlterColumnTarget {
  // Omitted leaves the stored comment alone.
  comment?: string | null
  newName: string
  reference?: ConstraintShape
  renamedValues: RenamedValue[]
}

const altered = ({ nullable, original, type }: EditColumnTarget) =>
  type !== original.type || nullable !== original.nullable

const commented = (
  target: EditColumnTarget
): target is EditColumnTarget & { comment: string | null } =>
  target.comment !== undefined && target.comment !== target.original.comment

// Alters under the old name first, so a failing alter leaves the column as it
// was; the key names the new one.
const editInSteps = async (
  dialect: Dialect,
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  target: EditColumnTarget
) => {
  const { column, newName, reference } = target
  if (altered(target)) {
    await db.executeQuery(alterColumnStatement(dialect, db, target))
  }
  if (newName !== column) {
    await db.executeQuery(renameColumnStatement(dialect, db, target))
  }
  if (reference) {
    await addConstraint(db, target, reference).execute()
  }
}

// MySQL converts enum rows by label, so a renamed label would truncate them:
// widen the type to hold both labels, then move the rows across.
const mysqlMoveRenamedValues = async (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  target: EditColumnTarget
) => {
  const { column, schema, table } = target
  // The default collation matches labels case-insensitively: a case-only
  // rename converts by itself, and widening would list the label twice.
  const renamed = target.renamedValues.filter(
    ({ from, to }) => from.toLowerCase() !== to.toLowerCase()
  )
  if (renamed.length === 0) {
    return
  }
  const values = new Set([
    ...(mysqlEnum.parse(target.type) ?? []),
    ...renamed.map(({ from }) => from),
  ])
  const widened = mysqlEnum.spell(
    Array.from(values, (value) => ({ value })),
    target.original.type
  )
  await db.executeQuery(
    alterColumnStatement(Dialect.MySQL, db, {
      ...target,
      nullable: target.original.nullable,
      type: widened,
    })
  )
  await sql`UPDATE ${sql.id(schema, table)} SET ${sql.id(column)} = CASE ${sql.id(column)} ${sql.join(
    renamed.map(({ from, to }) => sql`WHEN ${from} THEN ${to}`),
    sql` `
  )} END WHERE ${sql.id(column)} IN (${sql.join(renamed.map(({ from }) => from))})`.execute(
    db
  )
}

const clickhouseRefuseHeldValues = async (
  // oxlint-disable-next-line ts/no-explicit-any
  db: Kysely<any>,
  target: EditColumnTarget
) => {
  const { column, original, renamedValues, schema, table } = target
  const next = clickhouseEnum.parse(target.type)
  if (!next) {
    return
  }
  const kept = new Set([...next, ...renamedValues.map(({ from }) => from)])
  const dropped = (clickhouseEnum.parse(original.type) ?? []).filter(
    (value) => !kept.has(value)
  )
  if (dropped.length === 0) {
    return
  }
  const {
    rows: [held],
  } = await sql<{
    value: string
  }>`SELECT ${sql.id(column)} AS value FROM ${sql.id(schema, table)} WHERE ${sql.id(column)} IN (${sql.join(dropped)}) LIMIT 1`.execute(
    db
  )
  if (held) {
    throw new Error(
      `Rows still hold "${held.value}". Change them before removing the value.`
    )
  }
}

const mssqlCommentProcedure = (from: string | null, to: string | null) => {
  if (to === null) {
    return sql`sp_dropextendedproperty`
  }
  return from === null
    ? sql`sp_addextendedproperty`
    : sql`sp_updateextendedproperty`
}

export const editColumnQuery = (target: EditColumnTarget) =>
  createQuery({
    query: {
      clickhouse: async (db) => {
        const { comment, newName, schema, table } = target
        await clickhouseRefuseHeldValues(db, target)
        await editInSteps(Dialect.ClickHouse, db, target)
        if (commented(target)) {
          await sql`ALTER TABLE ${sql.id(schema, table)} COMMENT COLUMN ${sql.id(newName)} ${sql.lit(comment ?? '')}`.execute(
            db
          )
        }
      },
      mongodb: unsupported('Column changes'),
      mssql: async (db) => {
        const { newName, original, schema, table } = target
        await editInSteps(Dialect.MSSQL, db, target)
        if (commented(target)) {
          const { comment } = target
          const value = comment === null ? sql`` : sql`@value = ${comment}, `
          await sql`EXEC ${mssqlCommentProcedure(original.comment, comment)} @name = N'MS_Description', ${value}@level0type = N'SCHEMA', @level0name = ${schema}, @level1type = N'TABLE', @level1name = ${table}, @level2type = N'COLUMN', @level2name = ${newName}`.execute(
            db
          )
        }
      },
      // MySQL commits each DDL statement, so the rename, the alter and the key
      // go in one ALTER: a part that fails leaves the column untouched.
      mysql: async (db) => {
        const { column, comment, newName, nullable, reference, schema, table } =
          target
        await mysqlMoveRenamedValues(db, target)
        const columnAction =
          altered(target) || commented(target)
            ? sql`CHANGE COLUMN ${sql.id(column)} ${sql.id(newName)} ${mysqlColumnDefinition(target, comment)}${sql.raw(nullable ? '' : ' NOT NULL')}`
            : newName !== column &&
              sql`RENAME COLUMN ${sql.id(column)} TO ${sql.id(newName)}`
        const actions = [
          columnAction,
          reference && sql`ADD ${constraintClause(reference)}`,
        ].filter(Boolean)
        if (actions.length > 0) {
          await sql`ALTER TABLE ${sql.id(schema, table)} ${sql.join(actions)}`.execute(
            db
          )
        }
      },
      oracle: async (db) => {
        const { comment, newName, schema, table } = target
        await editInSteps(Dialect.Oracle, db, target)
        if (commented(target)) {
          await sql`COMMENT ON COLUMN ${sql.id(schema, table, newName)} IS ${sql.lit(comment ?? '')}`.execute(
            db
          )
        }
      },
      postgres: async (db) => {
        const { comment, newName, schema, table } = target
        await editInSteps(Dialect.Postgres, db, target)
        if (commented(target)) {
          await sql`COMMENT ON COLUMN ${sql.id(schema, table, newName)} IS ${sql.lit(comment)}`.execute(
            db
          )
        }
      },
      sqlite:
        altered(target) || commented(target) || target.reference
          ? unsupported('Changing a column')
          : (db) =>
              db.executeQuery(
                renameColumnStatement(Dialect.SQLite, db, target)
              ),
    },
  })
