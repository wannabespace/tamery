import type { AgentChange } from '@tamery/shared/agent-change'
import { getDialect } from '@tamery/shared/enums/connection-type'
import { sameList } from '@tamery/shared/utils'

import { suggestedName } from '~/core/catalog/engine-name'
import { diagramDrafts, diagramDraftsStore } from '~/core/drafts/diagram'
import {
  draftsActions,
  newRowsActions,
  tableSessionStore,
} from '~/core/table/session'

import { describeTable } from './describe-table'
import type { AgentTarget } from './target'
import { resolveResource } from './target'

const ROW_KINDS = new Set(['delete_rows', 'insert_rows', 'update_rows'])

type ProposedChange = AgentTarget & {
  change: AgentChange
  schema: string
  table: string
}

const checkColumns = (
  known: string[],
  rows: Record<string, unknown>[],
  table: string
) => {
  const unknown = rows
    .flatMap((row) => Object.keys(row))
    .find((column) => !known.includes(column))
  if (unknown) {
    throw new Error(
      `No column "${unknown}" in "${table}". Call describe_table for its columns.`
    )
  }
}

const stageRows = async ({
  change,
  schema,
  table,
  ...target
}: ProposedChange) => {
  const { resource } = resolveResource(target)
  const { columns, constraints } = await describeTable({
    ...target,
    schema,
    table,
  })
  const names = columns.map(({ name }) => name)
  const primaryKey =
    constraints.find(({ type }) => /primary/iu.test(type ?? ''))?.columns ?? []
  const store = tableSessionStore({ id: resource.id, schema, table })
  const keyed = (keys: Record<string, unknown>[]) => {
    if (primaryKey.length === 0) {
      throw new Error(
        `"${table}" has no primary key, so its rows cannot be drafted. Use execute.`
      )
    }
    const partial = keys.find(
      (key) => !sameList(Object.keys(key).toSorted(), primaryKey.toSorted())
    )
    if (partial) {
      throw new Error(
        `Name each row by its full primary key: ${primaryKey.join(', ')}.`
      )
    }
  }
  switch (change.kind) {
    case 'update_rows': {
      keyed(change.rows.map(({ key }) => key))
      checkColumns(
        names,
        change.rows.map(({ set }) => set),
        table
      )
      const drafts = draftsActions(store)
      for (const { key, set } of change.rows) {
        for (const [columnId, value] of Object.entries(set)) {
          drafts.upsert({ columnId, primaryKeys: key, value })
        }
      }
      return { rows: change.rows.length }
    }
    case 'insert_rows': {
      checkColumns(names, change.rows, table)
      const newRows = newRowsActions(store)
      for (const values of change.rows.toReversed()) {
        newRows.add(values)
      }
      return { rows: change.rows.length }
    }
    case 'delete_rows': {
      keyed(change.keys)
      store.set((state) => ({ ...state, deletions: change.keys }))
      return { rows: change.keys.length }
    }
    default: {
      throw new Error(`"${change.kind}" is not a row change.`)
    }
  }
}

const stageSchema = ({ change, schema, table, ...target }: ProposedChange) => {
  const { connection, resource } = resolveResource(target)
  const drafts = diagramDrafts(diagramDraftsStore(resource.id))
  const ref = { schema, table }
  switch (change.kind) {
    case 'create_table': {
      drafts.createTable(ref, change.columns)
      return
    }
    case 'add_column': {
      drafts.addColumn(ref, change.column)
      return
    }
    case 'rename_column': {
      drafts.renameColumn(ref, change.column, change.newName)
      return
    }
    case 'drop_column': {
      drafts.dropColumn(ref, change.column)
      return
    }
    case 'rename_table': {
      drafts.renameTable(ref, change.newName)
      return
    }
    case 'drop_table': {
      drafts.dropTable(ref, false)
      return
    }
    case 'add_index': {
      drafts.createIndex(ref, {
        columns: change.columns,
        name:
          change.name ??
          suggestedName(getDialect(connection.type), [
            table,
            ...change.columns,
            'idx',
          ]),
        unique: change.unique,
      })
      return
    }
    default: {
      throw new Error(`"${change.kind}" is not a schema change.`)
    }
  }
}

/** Stages a change in the table's or the visualizer's drafts; nothing runs until the user applies it in that review. */
export const proposeChange = async (proposed: ProposedChange) => {
  if (ROW_KINDS.has(proposed.change.kind)) {
    const { rows } = await stageRows(proposed)
    return {
      review: `Drafted ${rows} row change(s) in "${proposed.table}". The user reviews and saves them in that table; nothing has run yet.`,
      where: 'table' as const,
    }
  }
  stageSchema(proposed)
  return {
    review:
      'Drafted the schema change in the visualizer. The user reviews its SQL and applies it there; nothing has run yet.',
    where: 'visualizer' as const,
  }
}
