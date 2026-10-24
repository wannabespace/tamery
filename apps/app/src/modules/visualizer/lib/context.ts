import type { Dialect } from '@tamery/shared/enums/connection-type'
import { memoize } from 'memoza'
import { createContext, use } from 'react'
import { createStore } from 'seitu'

import { getCapabilities } from '~/core/catalog/capabilities'
import {
  foreignKeysCreatable,
  getSectionCapabilities,
  sectionAvailable,
} from '~/core/catalog/section-capabilities'

import type {
  Diagram,
  DiagramColumn,
  DiagramRelation,
  DiagramTable,
} from './schema'

export const getGates = (dialect: Dialect) => {
  const capabilities = getCapabilities(dialect)
  const constraints = getSectionCapabilities('constraints', dialect)

  return {
    alterColumns: capabilities.flags.includes('alterColumns'),
    cascade: capabilities.flags.includes('cascade'),
    ddlRollback: capabilities.flags.includes('ddlRollback'),
    dropForeignKeys: !!constraints.drop,
    foreignKeys: foreignKeysCreatable(dialect),
    indexes: sectionAvailable('indexes', dialect),
    policies: sectionAvailable('policies', dialect),
    schemas: capabilities.flags.includes('schemas'),
    triggers: sectionAvailable('triggers', dialect),
  }
}

export type DiagramGates = ReturnType<typeof getGates>

export interface DiagramActions {
  addColumn: (table: DiagramTable) => void
  createTable: () => void
  dropColumn: (table: DiagramTable, column: DiagramColumn) => void
  dropRelation: (relation: DiagramRelation) => void
  dropTable: (table: DiagramTable, cascade: boolean) => void
  editColumn: (table: DiagramTable, column: DiagramColumn) => void
  focusRelation: (relation: DiagramRelation) => void
  linkColumns: (link: {
    column: string
    foreignColumn: string
    foreignTable: string
    table: string
  }) => void
  openTable: (table: DiagramTable, newWindow?: boolean) => void
  renameTable: (table: DiagramTable) => void
  restoreTable: (table: DiagramTable) => void
  select: (tableId: string | null) => void
  toggleNullable: (table: DiagramTable, column: DiagramColumn) => void
}

interface DiagramView {
  hoveredRelationIds: string[]
  hoveredTableId: string | null
}

export const diagramViewStore = memoize((_resourceId: string) =>
  createStore<DiagramView>({
    hoveredRelationIds: [],
    hoveredTableId: null,
  })
)

type DiagramViewStore = ReturnType<typeof diagramViewStore>

export const COMPACT_ZOOM = 0.5

export interface DiagramContextValue {
  actions: DiagramActions
  can: DiagramGates
  diagram: Diagram
  search: string
  selectedId: string | null
  view: DiagramViewStore
}

export const DiagramContext = createContext<DiagramContextValue | null>(null)

export const useDiagram = () => {
  const value = use(DiagramContext)
  if (!value) {
    throw new Error('DiagramContext is not provided')
  }
  return value
}

export const relationTouches = (relation: DiagramRelation, tableId: string) =>
  relation.source.table === tableId || relation.target.table === tableId

export const tableMatches = (table: DiagramTable, search: string) =>
  table.name.toLowerCase().includes(search) ||
  table.columns.some((column) => column.name.toLowerCase().includes(search))
