import { memoize } from 'memoza'
import { nanoid } from 'nanoid'
import { createStore } from 'seitu'

import type { ReferentialAction } from '~/core/queries/constraints/shape'
import type {
  AlterColumnTarget,
  ColumnDefinition,
  NewColumn,
} from '~/core/queries/tables/shape'

export interface TableRef {
  schema: string
  table: string
}

export type DiagramDraft = { id: string } & TableRef &
  (
    | { columns: NewColumn[]; kind: 'createTable' }
    | { kind: 'renameTable'; newName: string }
    | { cascade: boolean; kind: 'dropTable' }
    | { column: NewColumn; kind: 'addColumn' }
    | { column: string; kind: 'renameColumn'; newName: string }
    | ({ kind: 'alterColumn' } & Omit<AlterColumnTarget, keyof TableRef>)
    | { column: string; kind: 'dropColumn' }
    | {
        columns: string[]
        foreignColumns: string[]
        foreignSchema: string
        foreignTable: string
        kind: 'addForeignKey'
        name: string
        onDelete: ReferentialAction
        onUpdate: ReferentialAction
      }
    | { kind: 'dropForeignKey'; name: string }
    | { columns: string[]; kind: 'createIndex'; name: string; unique: boolean }
  )

type Unsaved<T> = T extends unknown ? Omit<T, 'id'> : never

type ForeignKeyDraft = Extract<DiagramDraft, { kind: 'addForeignKey' }>

export const diagramDraftsStore = memoize((_resourceId: string) =>
  createStore<{ drafts: DiagramDraft[] }>({ drafts: [] })
)

type DiagramDraftsStore = ReturnType<typeof diagramDraftsStore>

const draftOn = ({ schema, table }: TableRef) => ({
  id: nanoid(8),
  schema,
  table,
})

const sameTable = (draft: TableRef, { schema, table }: TableRef) =>
  draft.schema === schema && draft.table === table

const sameColumn = (draft: DiagramDraft, ref: TableRef, column: string) =>
  sameTable(draft, ref) &&
  (draft.kind === 'renameColumn' ||
    draft.kind === 'alterColumn' ||
    draft.kind === 'dropColumn') &&
  draft.column === column

const addsColumn = (
  draft: DiagramDraft,
  ref: TableRef,
  column: string
): draft is Extract<DiagramDraft, { kind: 'addColumn' }> =>
  draft.kind === 'addColumn' &&
  sameTable(draft, ref) &&
  draft.column.name === column

const foreignRef = (draft: ForeignKeyDraft): TableRef => ({
  schema: draft.foreignSchema,
  table: draft.foreignTable,
})

const linksTo = (draft: DiagramDraft, ref: TableRef, column?: string) =>
  draft.kind === 'addForeignKey' &&
  ((sameTable(draft, ref) &&
    (column === undefined || draft.columns.includes(column))) ||
    (sameTable(foreignRef(draft), ref) &&
      (column === undefined || draft.foreignColumns.includes(column))))

const renameIn = (names: string[], from: string, to: string) =>
  names.map((name) => (name === from ? to : name))

const withoutTable = (drafts: DiagramDraft[], ref: TableRef) =>
  drafts.filter((draft) => !sameTable(draft, ref) && !linksTo(draft, ref))

export const diagramDrafts = (store: DiagramDraftsStore) => {
  const update = (change: (drafts: DiagramDraft[]) => DiagramDraft[]) =>
    store.set((state) => ({ drafts: change(state.drafts) }))
  const add = (draft: DiagramDraft) => update((drafts) => [...drafts, draft])
  const created = (ref: TableRef) =>
    store
      .get()
      .drafts.some(
        (draft) => draft.kind === 'createTable' && sameTable(draft, ref)
      )
  const added = (ref: TableRef, column: string) =>
    store.get().drafts.some((draft) => addsColumn(draft, ref, column))
  const editNew = (
    ref: TableRef,
    column: string,
    change: (column: NewColumn) => NewColumn
  ) =>
    update((drafts) =>
      drafts.map((draft) => {
        if (draft.kind === 'createTable' && sameTable(draft, ref)) {
          return {
            ...draft,
            columns: draft.columns.map((c) =>
              c.name === column ? change(c) : c
            ),
          }
        }
        if (addsColumn(draft, ref, column)) {
          return { ...draft, column: change(draft.column) }
        }
        return draft
      })
    )

  return {
    addColumn: (ref: TableRef, column: NewColumn) => {
      if (created(ref)) {
        update((drafts) =>
          drafts.map((draft) =>
            draft.kind === 'createTable' && sameTable(draft, ref)
              ? { ...draft, columns: [...draft.columns, column] }
              : draft
          )
        )
        return
      }
      add({ ...draftOn(ref), column, kind: 'addColumn' })
    },
    addForeignKey: (draft: Unsaved<ForeignKeyDraft>) =>
      add({ ...draft, id: nanoid(8) }),
    alterColumn: (
      ref: TableRef,
      column: string,
      shape: { nullable: boolean; type: string },
      original: ColumnDefinition
    ) => {
      if (created(ref) || added(ref, column)) {
        editNew(ref, column, (c) => ({ ...c, ...shape }))
        return
      }
      update((drafts) => {
        const rest = drafts.filter(
          (draft) =>
            !(sameColumn(draft, ref, column) && draft.kind === 'alterColumn')
        )
        if (
          shape.type === original.type &&
          shape.nullable === original.nullable
        ) {
          return rest
        }
        return [
          ...rest,
          { ...draftOn(ref), ...shape, column, kind: 'alterColumn', original },
        ]
      })
    },
    clear: () => store.set({ drafts: [] }),
    createIndex: (
      ref: TableRef,
      index: { columns: string[]; name: string; unique: boolean }
    ) => add({ ...draftOn(ref), ...index, kind: 'createIndex' }),
    createTable: (ref: TableRef, columns: NewColumn[]) =>
      add({ ...draftOn(ref), columns, kind: 'createTable' }),
    dropColumn: (ref: TableRef, column: string) =>
      update((drafts) => {
        const dropped = drafts.find(
          (draft) =>
            sameColumn(draft, ref, column) && draft.kind === 'dropColumn'
        )
        if (dropped) {
          return drafts.filter((draft) => draft !== dropped)
        }
        const rest = drafts
          .filter(
            (draft) =>
              !sameColumn(draft, ref, column) &&
              !linksTo(draft, ref, column) &&
              !addsColumn(draft, ref, column)
          )
          .map((draft) =>
            draft.kind === 'createTable' && sameTable(draft, ref)
              ? {
                  ...draft,
                  columns: draft.columns.filter((c) => c.name !== column),
                }
              : draft
          )
        return created(ref) || added(ref, column)
          ? rest
          : [...rest, { ...draftOn(ref), column, kind: 'dropColumn' }]
      }),
    dropForeignKey: (ref: TableRef, name: string) =>
      update((drafts) => {
        const pending = drafts.find(
          (draft) =>
            (draft.kind === 'addForeignKey' ||
              draft.kind === 'dropForeignKey') &&
            sameTable(draft, ref) &&
            draft.name === name
        )
        if (pending) {
          return drafts.filter((draft) => draft !== pending)
        }
        return [...drafts, { ...draftOn(ref), kind: 'dropForeignKey', name }]
      }),
    dropTable: (ref: TableRef, cascade: boolean) =>
      update((drafts) => [
        ...withoutTable(drafts, ref),
        ...(created(ref)
          ? []
          : [{ ...draftOn(ref), cascade, kind: 'dropTable' as const }]),
      ]),
    remove: (id: string) =>
      update((drafts) => {
        const draft = drafts.find((entry) => entry.id === id)
        if (draft?.kind === 'createTable') {
          return withoutTable(drafts, draft)
        }
        return drafts.filter(
          (entry) =>
            entry.id !== id &&
            !(
              draft?.kind === 'addColumn' &&
              linksTo(entry, draft, draft.column.name)
            )
        )
      }),
    renameColumn: (ref: TableRef, column: string, newName: string) => {
      if (created(ref) || added(ref, column)) {
        editNew(ref, column, (c) => ({ ...c, name: newName }))
        update((drafts) =>
          drafts.map((draft) =>
            draft.kind === 'addForeignKey' && linksTo(draft, ref, column)
              ? {
                  ...draft,
                  columns: sameTable(draft, ref)
                    ? renameIn(draft.columns, column, newName)
                    : draft.columns,
                  foreignColumns: sameTable(foreignRef(draft), ref)
                    ? renameIn(draft.foreignColumns, column, newName)
                    : draft.foreignColumns,
                }
              : draft
          )
        )
        return
      }
      update((drafts) => {
        const rest = drafts.filter(
          (draft) =>
            !(sameColumn(draft, ref, column) && draft.kind === 'renameColumn')
        )
        if (newName === column) {
          return rest
        }
        return [
          ...rest,
          { ...draftOn(ref), column, kind: 'renameColumn', newName },
        ]
      })
    },
    renameTable: (ref: TableRef, newName: string) => {
      if (created(ref)) {
        update((drafts) =>
          drafts.map((draft) => {
            const renamed = sameTable(draft, ref)
              ? { ...draft, table: newName }
              : draft
            return renamed.kind === 'addForeignKey' &&
              sameTable(foreignRef(renamed), ref)
              ? { ...renamed, foreignTable: newName }
              : renamed
          })
        )
        return
      }
      update((drafts) => {
        const rest = drafts.filter(
          (draft) => !(draft.kind === 'renameTable' && sameTable(draft, ref))
        )
        if (newName === ref.table) {
          return rest
        }
        return [...rest, { ...draftOn(ref), kind: 'renameTable', newName }]
      })
    },
    restoreTable: (ref: TableRef) =>
      update((drafts) =>
        drafts.filter(
          (draft) => !(draft.kind === 'dropTable' && sameTable(draft, ref))
        )
      ),
    // Compared by identity: a draft edited or queued meanwhile is a new object and must stay.
    settle: (applied: DiagramDraft[]) =>
      update((drafts) => drafts.filter((draft) => !applied.includes(draft))),
  }
}
