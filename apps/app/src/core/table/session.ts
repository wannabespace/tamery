import { omit } from '@tamery/shared/utils'
import { valueToText } from '@tamery/shared/value-text'
import type { GridRow } from '@tamery/table'
import { memoize } from 'memoza'
import { createContext, use } from 'react'
import { createStore } from 'seitu'

import { posthog } from '~/lib/posthog'

export type PrimaryKeys = Record<string, unknown>

export interface Draft {
  primaryKeys: PrimaryKeys
  columnId: string
  value: unknown
  error?: string
  isCommitting?: boolean
}

export interface NewRow {
  id: string
  values: Record<string, unknown>
  error?: string
  isCommitting?: boolean
}

export interface TableSessionState {
  /** Rows an agent proposed to delete; the table's delete dialog opens on them, since deletes are confirmed there rather than staged. */
  deletions: PrimaryKeys[]
  drafts: Record<string, Draft>
  flash: { at: number; keys: ReadonlySet<string> } | null
  lastClickedIndex: number | null
  /** Staged inserts, newest first; they lead the grid (`stagedGrid`). */
  newRows: NewRow[]
  selected: PrimaryKeys[]
  selectionState: { anchorIndex: number | null; focusIndex: number | null }
}

const defaultSessionState: TableSessionState = {
  deletions: [],
  drafts: {},
  flash: null,
  lastClickedIndex: null,
  newRows: [],
  selected: [],
  selectionState: { anchorIndex: null, focusIndex: null },
}

export const tableSessionStore = memoize(
  (_key: { id: string; schema: string; table: string }) =>
    createStore(defaultSessionState)
)

export type TableSessionStore = ReturnType<typeof tableSessionStore>

export const TableSessionStoreContext = createContext<TableSessionStore | null>(
  null
)

export const useTableSessionStore = () => {
  const store = use(TableSessionStoreContext)
  if (!store) {
    throw new Error('TableSessionStoreContext is not provided')
  }
  return store
}

export const primaryKeysKey = (primaryKeys: PrimaryKeys) =>
  Object.entries(primaryKeys)
    .toSorted()
    .map(
      ([key, value]) =>
        `${key}=${value === null || value === undefined ? value : valueToText(value)}`
    )
    .join('|')

export const getRowPrimaryKeysValues = (
  row: Record<string, unknown>,
  primaryKeys: string[]
): PrimaryKeys => {
  const values: PrimaryKeys = {}
  for (const key of primaryKeys) {
    values[key] = row[key]
  }
  return values
}

export const getRowKeyByPrimaryKeys = (
  row: Record<string, unknown>,
  primaryKeys: string[]
) => primaryKeysKey(getRowPrimaryKeysValues(row, primaryKeys))

export const draftKey = (primaryKeys: PrimaryKeys, columnId: string) =>
  `${primaryKeysKey(primaryKeys)}:${columnId}`

type StagedStatus = Partial<Pick<Draft, 'error' | 'isCommitting'>>

export const draftsActions = (store: TableSessionStore) => {
  const setDrafts = (
    update: (drafts: Record<string, Draft>) => Record<string, Draft>
  ) => {
    store.set((state) => ({ ...state, drafts: update(state.drafts) }))
  }

  const updateRow = (
    primaryKeys: PrimaryKeys,
    update: (draft: Draft) => Draft | null
  ) => {
    const rowKey = primaryKeysKey(primaryKeys)
    setDrafts((drafts) =>
      Object.fromEntries(
        Object.entries(drafts).flatMap(([key, draft]) => {
          if (primaryKeysKey(draft.primaryKeys) !== rowKey) {
            return [[key, draft]]
          }
          const next = update(draft)
          return next ? [[key, next]] : []
        })
      )
    )
  }

  // A row saves as one statement, so its error stops applying once any of its changes goes.
  const remove = (primaryKeys: PrimaryKeys, columnId: string) => {
    updateRow(primaryKeys, (draft) =>
      draft.columnId === columnId ? null : { ...draft, error: undefined }
    )
  }

  return {
    clear: () => {
      store.set((state) => ({ ...state, drafts: {}, newRows: [] }))
    },
    discard: (primaryKeys: PrimaryKeys, columnId: string) => {
      posthog.capture('draft_discarded')
      remove(primaryKeys, columnId)
    },
    discardRow: (primaryKeys: PrimaryKeys) => {
      posthog.capture('row_changes_discarded')
      updateRow(primaryKeys, () => null)
    },
    remove,
    setRowStatus: (primaryKeys: PrimaryKeys, status: StagedStatus) =>
      updateRow(primaryKeys, (draft) => ({ ...draft, ...status })),
    upsert: (draft: Draft) =>
      setDrafts((drafts) => ({
        ...drafts,
        [draftKey(draft.primaryKeys, draft.columnId)]: draft,
      })),
  }
}

export const isSaving = ({
  drafts,
  newRows,
}: Pick<TableSessionState, 'drafts' | 'newRows'>) =>
  Object.values(drafts).some((draft) => draft.isCommitting) ||
  newRows.some((row) => row.isCommitting)

export const stagedActions = (store: TableSessionStore) => ({
  setStatus: (status: StagedStatus) =>
    store.set((state) => ({
      ...state,
      drafts: Object.fromEntries(
        Object.entries(state.drafts).map(([key, draft]) => [
          key,
          { ...draft, ...status },
        ])
      ),
      newRows: state.newRows.map((row) => ({ ...row, ...status })),
    })),
  settle: (submitted: { drafts: Draft[]; newRows: NewRow[] }) => {
    const ids = new Set(submitted.newRows.map((row) => row.id))
    store.set((state) => ({
      ...state,
      drafts: omit(
        state.drafts,
        submitted.drafts.map((draft) =>
          draftKey(draft.primaryKeys, draft.columnId)
        )
      ),
      newRows: state.newRows.filter((row) => !ids.has(row.id)),
    }))
  },
})

export type GridEntry =
  | { kind: 'new'; newRow: NewRow }
  | { kind: 'saved'; index: number; keys: PrimaryKeys; row: GridRow }

export const stagedGrid = (
  newRows: NewRow[],
  rows: GridRow[],
  primaryColumns: string[]
) => {
  const rowAt = (index: number): GridEntry => {
    const newRow = newRows[index]
    if (newRow) {
      return { kind: 'new', newRow }
    }
    const row = rows[index - newRows.length] ?? {}
    return {
      index: index - newRows.length,
      keys: getRowPrimaryKeysValues(row, primaryColumns),
      kind: 'saved',
      row,
    }
  }
  return {
    rowAt,
    rowKey: (index: number) => {
      const entry = rowAt(index)
      return entry.kind === 'new' ? entry.newRow.id : primaryKeysKey(entry.keys)
    },
    rows: [...newRows.map((newRow) => newRow.values), ...rows],
  }
}

export const newRowsActions = (store: TableSessionStore) => {
  const update = (id: string, patch: (row: NewRow) => NewRow | null) =>
    store.set((state) => ({
      ...state,
      newRows: state.newRows.flatMap((row) => {
        if (row.id !== id) {
          return [row]
        }
        const next = patch(row)
        return next ? [next] : []
      }),
    }))

  return {
    add: (values: Record<string, unknown>) => {
      const id = crypto.randomUUID()
      store.set((state) => ({
        ...state,
        newRows: [{ id, values }, ...state.newRows],
      }))
      return id
    },
    discard: (id: string) => {
      posthog.capture('staged_row_discarded')
      update(id, () => null)
    },
    setStatus: (id: string, status: StagedStatus) =>
      update(id, (row) => ({ ...row, ...status })),
    setValue: (id: string, columnId: string, value: unknown) =>
      update(id, (row) => ({
        ...row,
        error: undefined,
        values: { ...row.values, [columnId]: value },
      })),
  }
}
