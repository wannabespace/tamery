import type { Dialect } from '@tamery/shared/enums/connection-type'
import type { GridRow } from '@tamery/table'
import { useSubscription } from 'seitu/react'

import { rowIdentity } from '~/core/queries/rows/shape'
import type { Column } from '~/core/table/cell/utils'
import type { DataGridCell } from '~/core/table/cursor'
import {
  draftKey,
  draftsActions,
  newRowsActions,
  stagedGrid,
  useTableSessionStore,
} from '~/core/table/session'
import type { TableSessionStore } from '~/core/table/session'
import { createTransformer } from '~/core/transformers/create-transformer'

import { tableGridRef } from './grid-ref'
import { isSameValue } from './hooks'

const isFilledByDatabase = (column: Column) =>
  column.isGenerated || column.isIdentity

export const stageRow = (
  sessionStore: TableSessionStore,
  visible: Column[],
  values: Record<string, unknown>
) => {
  const id = newRowsActions(sessionStore).add(values)
  const column = visible.find((c) => !isFilledByDatabase(c)) ?? visible[0]
  if (column) {
    tableGridRef.current?.reveal({ column: column.id, row: id })
  }
}

export const useStagedEdits = ({
  columns,
  dialect,
  rows,
  visible,
}: {
  columns: Column[]
  dialect: Dialect
  rows: GridRow[]
  visible: Column[]
}) => {
  const sessionStore = useTableSessionStore()
  const newRows = useSubscription(sessionStore, {
    selector: (state) => state.newRows,
  })
  const staged = stagedGrid(
    newRows,
    rows,
    rowIdentity(columns, dialect).columns
  )

  const getValue = ({ column, row, rowIndex }: DataGridCell) => {
    const entry = staged.rowAt(rowIndex)
    const draft =
      entry.kind === 'saved'
        ? sessionStore.get().drafts[draftKey(entry.keys, column.id)]
        : undefined
    return draft ? draft.value : row[column.id]
  }

  const edit = ({ column, row, rowIndex }: DataGridCell, value: unknown) => {
    const entry = staged.rowAt(rowIndex)
    if (entry.kind === 'new') {
      newRowsActions(sessionStore).setValue(entry.newRow.id, column.id, value)
      return
    }
    const actions = draftsActions(sessionStore)
    const transformer = createTransformer(dialect, column)
    if (
      isSameValue(value, row[column.id], (v) =>
        transformer.fromConnection(v).toRaw()
      )
    ) {
      actions.remove(entry.keys, column.id)
      return
    }
    actions.upsert({
      columnId: column.id,
      primaryKeys: entry.keys,
      value,
    })
  }

  return {
    ...staged,
    canEdit: (column: Column, rowIndex: number) =>
      column.isEditable !== false ||
      (staged.rowAt(rowIndex).kind === 'new' && !isFilledByDatabase(column)),
    duplicate: (cell: DataGridCell) =>
      stageRow(
        sessionStore,
        visible,
        Object.fromEntries(
          columns
            .filter(
              (column) => !column.primaryKey && !isFilledByDatabase(column)
            )
            .map((column) => [column.id, getValue({ ...cell, column })])
        )
      ),
    edit,
    getValue,
  }
}

export type StagedEditing = Pick<
  ReturnType<typeof useStagedEdits>,
  'canEdit' | 'duplicate' | 'edit' | 'getValue' | 'rowAt'
>
