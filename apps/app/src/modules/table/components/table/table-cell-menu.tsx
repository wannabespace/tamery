import {
  ArrowTurnBackwardIcon,
  CheckmarkSquare02Icon,
  Copy02Icon,
  Delete02Icon,
  EraserIcon,
  FilterAddIcon,
  Link01Icon,
} from '@hugeicons/core-free-icons'
import {
  cellToFilterValues,
  EQUAL_FILTER,
  IS_NULL_FILTER,
} from '@tamery/shared/filters'
import { uppercaseFirst } from '@tamery/shared/utils'

import type { AppMenuNode } from '~/components/app-menu'
import type { CellMenuExtra } from '~/core/table/cell/cell-menu'
import type { DataGridCell } from '~/core/table/cursor'
import type { TableSessionStore } from '~/core/table/session'
import { draftKey, draftsActions, newRowsActions } from '~/core/table/session'
import { posthog } from '~/lib/posthog'

import type { ColumnActions } from '../../lib/column-menu'
import { columnMenuItems } from '../../lib/column-menu'
import { rowSelection } from '../../lib/row-selection'
import type { StagedEditing } from '../../lib/staged-edits'
import type { TablePageStore } from '../../lib/store'
import { cellHop } from '../references/hops'
import type { OpenPeek } from '../references/reference-buttons'
import { deleteRowsDialogRef } from './actions-delete'

export const tableCellMenu = ({
  actions,
  canWriteRows,
  cell,
  element,
  isEditable,
  onPeek,
  saving,
  sessionStore,
  staged,
  store,
}: {
  actions: ColumnActions
  canWriteRows: boolean
  cell: DataGridCell
  element: Element | null | undefined
  isEditable: boolean
  onPeek: OpenPeek
  saving: boolean
  sessionStore: TableSessionStore
  staged: StagedEditing
  store: TablePageStore
}): CellMenuExtra => {
  const { column } = cell
  const Row = uppercaseFirst(actions.names.row)
  const entry = staged.rowAt(cell.rowIndex)
  const value = staged.getValue(cell)
  // Filters match saved rows, so Filter by Value takes the stored value, never a pending draft.
  const storedValue = cell.row[column.id]
  const hop = cellHop(column, value)
  const hasDraft =
    entry.kind === 'saved' &&
    draftKey(entry.keys, column.id) in sessionStore.get().drafts
  const canSetNull =
    isEditable && staged.canEdit(column, cell.rowIndex) && column.isNullable

  const rowItems: AppMenuNode[] = [
    ...(isEditable && entry.kind === 'saved'
      ? ([
          {
            icon: CheckmarkSquare02Icon,
            label: rowSelection.has(sessionStore.get(), entry.keys)
              ? `Deselect ${Row}`
              : `Select ${Row}`,
            onSelect: () =>
              sessionStore.set((state) =>
                rowSelection.toggle(state, [entry.keys])
              ),
            shortcut: 'selectRows',
          },
        ] satisfies AppMenuNode[])
      : []),
    ...(canWriteRows
      ? [
          {
            icon: Copy02Icon,
            label: `Duplicate ${Row}`,
            onSelect: () => {
              posthog.capture('row_duplicated')
              staged.duplicate(cell)
            },
          },
        ]
      : []),
    ...(entry.kind === 'new' && !saving
      ? [
          {
            icon: ArrowTurnBackwardIcon,
            label: `Discard ${Row}`,
            onSelect: () =>
              newRowsActions(sessionStore).discard(entry.newRow.id),
          },
        ]
      : []),
    ...(canWriteRows && entry.kind === 'saved' && !saving
      ? ([
          {
            icon: Delete02Icon,
            label: `Delete ${Row}`,
            onSelect: () => deleteRowsDialogRef.current?.open([entry.keys]),
            variant: 'destructive',
          },
        ] satisfies AppMenuNode[])
      : []),
  ]
  const cellItems: AppMenuNode[] = [
    ...(hasDraft && !saving
      ? [
          {
            icon: ArrowTurnBackwardIcon,
            label: 'Discard Change',
            onSelect: () =>
              draftsActions(sessionStore).discard(entry.keys, column.id),
          },
        ]
      : []),
    ...(hop && element
      ? [
          {
            icon: Link01Icon,
            label: 'Show References',
            onSelect: () => onPeek(element, hop),
          },
        ]
      : []),
    ...(canSetNull
      ? [
          {
            disabled: value === null,
            icon: EraserIcon,
            label: 'Set Null',
            onSelect: () => staged.edit(cell, null),
          },
        ]
      : []),
  ]

  return {
    cell: cellItems,
    groups: [
      {
        items: [
          {
            disabled: storedValue === undefined,
            icon: FilterAddIcon,
            label: 'Filter by Value',
            onSelect: () => {
              const ref = storedValue === null ? IS_NULL_FILTER : EQUAL_FILTER
              store.set((state) => ({
                ...state,
                filters: [
                  ...state.filters,
                  {
                    column: column.id,
                    ref,
                    values: cellToFilterValues(ref, storedValue),
                  },
                ],
              }))
              posthog.capture('cell_filter_added')
            },
          },
          { type: 'separator' },
          ...columnMenuItems({
            ...actions,
            anchor: element ?? null,
            column,
            store,
          }),
        ],
        label: uppercaseFirst(actions.names.column),
        type: 'group',
      },
    ],
    row: rowItems,
  }
}
