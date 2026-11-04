import { activeFilter } from '@tamery/shared/filters'
import { omit } from '@tamery/shared/utils'
import { type } from 'arktype'
import { memoize } from 'memoza'
import { createContext, use } from 'react'
import { createWebStorageValue } from 'seitu/web'

import type { GeneratorId } from '../seeds/registry'

export const tablePageType = type({
  // '' turns off a column's default label.
  columnLabels: 'Record<string, string>',
  columnOrder: 'string[]',
  columnSizes: 'Record<string, number>',
  filters: activeFilter.array(),
  generators: {
    '[string]': {
      'customExpression?': 'string',
      generatorId: 'string' as type.cast<GeneratorId>,
      isNullable: 'boolean',
    },
  },
  hiddenColumns: 'string[]',
  orderBy: {
    '[string]': '"ASC" | "DESC"',
  },
  pinnedColumns: 'string[]',
  prompt: 'string',
  seedsCount: 'number',
  view: '"grid" | "documents"',
})

const defaultState: typeof tablePageType.infer = {
  columnLabels: {},
  columnOrder: [],
  columnSizes: {},
  filters: [],
  generators: {},
  hiddenColumns: [],
  orderBy: {},
  pinnedColumns: [],
  prompt: '',
  seedsCount: 10,
  view: 'grid',
}

export const tablePageStore = memoize(
  ({ id, schema, table }: { id: string; schema: string; table: string }) =>
    createWebStorageValue({
      defaultValue: defaultState,
      key: `${id}.${schema}-${table}.store`,
      schema: tablePageType,
      type: 'localStorage',
    })
)

export type TablePageStore = ReturnType<typeof tablePageStore>

export const TablePageStoreContext = createContext<TablePageStore | null>(null)

export const useTablePageStore = () => {
  const store = use(TablePageStoreContext)
  if (!store) {
    throw new Error('TablePageStoreContext is not provided')
  }
  return store
}

const NEXT_ORDER = { ASC: 'DESC', DESC: null } as const

type OrderBy = typeof tablePageType.infer.orderBy

export const columnsOrder = (store: TablePageStore) => {
  const updateOrderBy = (update: (orderBy: OrderBy) => OrderBy) =>
    store.set(
      (state) =>
        ({ ...state, orderBy: update(state.orderBy) }) satisfies typeof state
    )

  const setOrder = (columnId: string, order: 'ASC' | 'DESC') =>
    updateOrderBy((orderBy) => ({ ...orderBy, [columnId]: order }))

  const removeOrder = (columnId: string) =>
    updateOrderBy((orderBy) => omit(orderBy, [columnId]))

  const cycleOrder = (columnId: string, addToSort: boolean) =>
    updateOrderBy((orderBy) => {
      const current = orderBy[columnId]
      const next = current ? NEXT_ORDER[current] : 'ASC'
      const others = addToSort || current ? orderBy : {}
      return next ? { ...others, [columnId]: next } : omit(others, [columnId])
    })

  return {
    cycleOrder,
    removeOrder,
    setOrder,
  }
}

export const orderColumns = <T extends { id: string }>(
  columns: T[],
  order: string[]
) => {
  const rank = (id: string) => {
    const index = order.indexOf(id)
    return index === -1 ? order.length : index
  }
  return columns.toSorted((a, b) => rank(a.id) - rank(b.id))
}

export const columnView = <T extends { id: string }>(
  columns: T[],
  {
    columnOrder,
    hiddenColumns,
    pinnedColumns,
  }: Pick<
    typeof tablePageType.infer,
    'columnOrder' | 'hiddenColumns' | 'pinnedColumns'
  >,
  canPin: boolean
) => {
  const ordered = orderColumns(columns, columnOrder)
  const shown = ordered.filter((column) => !hiddenColumns.includes(column.id))
  const pinned = canPin
    ? pinnedColumns.filter((id) => shown.some((column) => column.id === id))
    : []
  return {
    pinned,
    reordered: (ids: string[]) => {
      const moved = ids.filter((id) => shown.some((column) => column.id === id))
      return ordered.map((column) =>
        hiddenColumns.includes(column.id)
          ? column.id
          : (moved.shift() ?? column.id)
      )
    },
    visible: [
      ...orderColumns(
        shown.filter((column) => pinned.includes(column.id)),
        pinned
      ),
      ...shown.filter((column) => !pinned.includes(column.id)),
    ],
  }
}

export const columnLayout = (store: TablePageStore) => ({
  hide: (id: string) =>
    store.set((state) => ({
      ...state,
      hiddenColumns: [...state.hiddenColumns, id],
    })),
  reorder: (ids: string[]) =>
    store.set((state) => ({ ...state, columnOrder: ids })),
  resetOrder: () => store.set((state) => ({ ...state, columnOrder: [] })),
  resetSize: (id: string) =>
    store.set((state) => ({
      ...state,
      columnSizes: omit(state.columnSizes, [id]),
    })),
  resize: (id: string, width: number) =>
    store.set((state) => ({
      ...state,
      columnSizes: { ...state.columnSizes, [id]: width },
    })),
  setLabel: (id: string, label: string) =>
    store.set((state) => ({
      ...state,
      columnLabels: { ...state.columnLabels, [id]: label },
    })),
  togglePin: (id: string) =>
    store.set((state) => ({
      ...state,
      pinnedColumns: state.pinnedColumns.includes(id)
        ? state.pinnedColumns.filter((other) => other !== id)
        : [...state.pinnedColumns, id],
    })),
})
