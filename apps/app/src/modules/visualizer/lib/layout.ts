import { graphlib, layout } from '@dagrejs/dagre'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'

import type { DiagramDraft } from '~/core/drafts/diagram'

import type { Positions } from './positions'
import { visualizerLayout, visualizerStore } from './positions'
import type { Diagram, DiagramTable } from './schema'
import { tableNodeId } from './schema'

// Keep in sync with the card's w-64, h-8 header and h-7 rows in table-node.tsx.
export const NODE_WIDTH = 256
const NODE_HEADER_HEIGHT = 32
const NODE_ROW_HEIGHT = 28
const NODE_BODY_PADDING = 8
const RANK_GAP = 96
const NODE_GAP = 32

export const fitViewOptions = {
  maxZoom: 1,
  padding: { bottom: '48px', top: '80px', x: '48px' },
} as const

const nodeHeight = (table: DiagramTable) =>
  NODE_HEADER_HEIGHT +
  NODE_BODY_PADDING +
  Math.max(table.columns.length, 1) * NODE_ROW_HEIGHT

const layoutConnected = (
  tables: DiagramTable[],
  relations: Diagram['relations']
) => {
  const graph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ nodesep: NODE_GAP, rankdir: 'LR', ranksep: RANK_GAP })

  for (const table of tables) {
    graph.setNode(table.id, { height: nodeHeight(table), width: NODE_WIDTH })
  }
  for (const relation of relations) {
    graph.setEdge(relation.target.table, relation.source.table)
  }

  layout(graph)

  const { height = 0, width = 0 } = graph.graph()
  const positions: Positions = Object.fromEntries(
    tables.map((table) => {
      const { x, y } = graph.node(table.id)
      return [table.id, { x: x - NODE_WIDTH / 2, y: y - nodeHeight(table) / 2 }]
    })
  )

  return { height, positions, width }
}

const layoutDiagram = ({
  relations,
  tables,
}: Pick<Diagram, 'relations' | 'tables'>): Positions => {
  const linked = new Set(
    relations.flatMap((relation) => [
      relation.source.table,
      relation.target.table,
    ])
  )
  const connected = layoutConnected(
    tables.filter((table) => linked.has(table.id)),
    relations
  )
  const standalone = tables.filter((table) => !linked.has(table.id))
  const columns = Math.max(
    1,
    linked.size
      ? Math.floor((connected.width + NODE_GAP) / (NODE_WIDTH + NODE_GAP))
      : Math.ceil(Math.sqrt(standalone.length))
  )
  const positions = { ...connected.positions }
  let rowTop = linked.size ? connected.height + RANK_GAP : 0

  for (let start = 0; start < standalone.length; start += columns) {
    const row = standalone.slice(start, start + columns)
    for (const [index, table] of row.entries()) {
      positions[table.id] = { x: index * (NODE_WIDTH + NODE_GAP), y: rowTop }
    }
    rowTop += Math.max(...row.map(nodeHeight)) + NODE_GAP
  }

  return positions
}

export const usePositions = (
  resourceId: string,
  schema: string,
  diagram: Diagram
) => {
  const saved = useSubscription(visualizerStore(resourceId), {
    isEqual: Object.is,
    selector: (state) => state.positions[schema],
  })
  const [dragged, setDragged] = useState<Positions>({})
  const auto = layoutDiagram({
    relations: diagram.relations.filter((r) => r.state !== 'added'),
    tables: diagram.tables.filter((t) => t.state !== 'added'),
  })
  const positions: Positions = Object.fromEntries(
    diagram.tables.map((table) => [
      table.id,
      dragged[table.id] ??
        saved?.[table.id] ??
        auto[table.id] ?? { x: 0, y: 0 },
    ])
  )

  const commit = (next: Positions) =>
    visualizerLayout.setPositions(resourceId, schema, () => next)

  return {
    arrange: () => {
      const arranged = { ...positions, ...auto }
      setDragged(arranged)
      commit(arranged)
    },
    commit,
    positions,
    setDragged,
    settle: (applied: DiagramDraft[]) => {
      commit(positions)
      for (const draft of applied) {
        if (draft.kind === 'renameTable' || draft.kind === 'dropTable') {
          visualizerLayout.moveTable(
            resourceId,
            draft.schema,
            tableNodeId(draft.schema, draft.table),
            draft.kind === 'renameTable'
              ? tableNodeId(draft.schema, draft.newName)
              : null
          )
        }
      }
      setDragged({})
    },
  }
}
