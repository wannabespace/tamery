import { useRouter } from '@tanstack/react-router'
import { useReactFlow } from '@xyflow/react'
import type { Dispatch, SetStateAction } from 'react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { engineName } from '~/core/catalog/engine-name'
import { useConnectionContext } from '~/core/connection/route'
import type { DiagramDraft, diagramDrafts } from '~/core/drafts/diagram'
import type { constraintsType } from '~/core/queries/constraints/list'
import { foreignKeyName } from '~/core/queries/constraints/shape'
import type { NewColumn } from '~/core/queries/tables/shape'
import type { ColumnDialogRequest } from '~/core/table/column-dialog'
import type { TableDialogRequest } from '~/core/table/table-dialog'
import type { ColumnReference } from '~/core/table/use-reference-targets'
import { openTab } from '~/core/tabs/actions'
import { tableTabId } from '~/core/tabs/ids'
import { checkOrUpgrade } from '~/core/user/permissions'
import { openNewWindow } from '~/utils/new-window'

import type { DiagramActions } from './context'
import { fitViewOptions, NODE_WIDTH } from './layout'
import { visualizerLayout } from './positions'
import type { Diagram, DiagramColumn, DiagramTable } from './schema'
import { tableNodeId } from './schema'

export const useDiagramActions = ({
  constraints,
  diagram,
  drafts,
  edit,
  schema,
  setColumnRequest,
  setPickedSchema,
  setSelectedId,
  setTableRequest,
}: {
  constraints: (typeof constraintsType.infer)[]
  diagram: Diagram
  drafts: DiagramDraft[]
  edit: ReturnType<typeof diagramDrafts>
  schema: string
  setColumnRequest: (
    request: ColumnDialogRequest<DiagramTable, DiagramColumn> | null
  ) => void
  setPickedSchema: (schema: string) => void
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setTableRequest: (request: TableDialogRequest<DiagramTable> | null) => void
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const router = useRouter()
  const flow = useReactFlow()

  const addForeignKey = (
    source: DiagramTable,
    column: string,
    target: ColumnReference
  ) => {
    const taken = new Set([
      ...constraints
        .filter((c) => c.schema === source.schema)
        .map((c) => c.name),
      ...drafts.flatMap((draft) =>
        draft.kind === 'addForeignKey' ? [draft.name] : []
      ),
    ])
    edit.addForeignKey({
      columns: [column],
      foreignColumns: [target.column],
      foreignSchema: target.schema,
      foreignTable: target.table,
      kind: 'addForeignKey',
      name: foreignKeyName(dialect, source.table, column, taken),
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
      schema: source.schema,
      table: source.table,
    })
  }

  const actions: DiagramActions = {
    addColumn: (table) => setColumnRequest({ column: null, table }),
    createTable: () => setTableRequest({ schema, table: null }),
    dropColumn: (table, column) => edit.dropColumn(table, column.id),
    dropRelation: (relation) => {
      const source = diagram.tables.find((t) => t.id === relation.source.table)
      if (source) {
        edit.dropForeignKey(source, relation.name)
      }
    },
    dropTable: (table, cascade) => edit.dropTable(table, cascade),
    editColumn: (table, column) => setColumnRequest({ column, table }),
    focusRelation: (relation) => {
      void flow.fitView({
        ...fitViewOptions,
        duration: 300,
        nodes: [{ id: relation.source.table }, { id: relation.target.table }],
      })
    },
    linkColumns: ({ column, foreignColumn, foreignTable, table }) => {
      const source = diagram.tables.find((t) => t.id === table)
      const target = diagram.tables.find((t) => t.id === foreignTable)
      if (source && target) {
        addForeignKey(source, column, { ...target, column: foreignColumn })
      }
    },
    openTable: (table, newWindow) => {
      const location = {
        params: {
          resourceId: connectionResource.id,
          tabId: tableTabId(table.schema, table.table),
        },
        to: '/connection/$resourceId/$tabId' as const,
      }
      if (newWindow) {
        if (checkOrUpgrade('tab.multiple')) {
          openNewWindow(router.buildLocation(location).href)
        }
        return
      }
      openTab(connectionResource.id, tableTabId(table.schema, table.table))
      void router.navigate(location)
    },
    renameTable: (table) => setTableRequest({ schema: table.schema, table }),
    restoreTable: (table) => edit.restoreTable(table),
    select: (id) => setSelectedId(id),
    toggleNullable: (table, column) =>
      edit.alterColumn(
        table,
        column.id,
        { nullable: !column.nullable, type: column.type },
        column.original
      ),
  }

  const submitColumn = (
    { column, table }: ColumnDialogRequest<DiagramTable, DiagramColumn>,
    next: NewColumn,
    reference: ColumnReference | null
  ) => {
    const id =
      column === null || column.state === 'added' ? next.name : column.id
    if (column === null) {
      edit.addColumn(table, next)
    } else {
      if (next.name !== column.name) {
        edit.renameColumn(table, column.id, next.name)
      }
      if (next.type !== column.type || next.nullable !== column.nullable) {
        edit.alterColumn(
          table,
          id,
          { nullable: next.nullable, type: next.type },
          column.original
        )
      }
    }
    if (reference) {
      addForeignKey(table, id, reference)
    }
    setColumnRequest(null)
  }

  const submitTable = (
    { table }: TableDialogRequest<DiagramTable>,
    targetSchema: string,
    name: string
  ) => {
    if (table) {
      edit.renameTable(table, name)
      if (table.state === 'added') {
        const renamedId = tableNodeId(table.schema, name)
        visualizerLayout.moveTable(
          connectionResource.id,
          table.schema,
          table.id,
          renamedId
        )
        setSelectedId((current) => (current === table.id ? renamedId : current))
      }
    } else {
      edit.createTable({ schema: targetSchema, table: name }, [
        {
          name: engineName(dialect, 'id'),
          nullable: false,
          primaryKey: true,
          type: getCapabilities(dialect).columnTypes.id,
        },
      ])
      const id = tableNodeId(targetSchema, name)
      const center = flow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      visualizerLayout.setPositions(
        connectionResource.id,
        targetSchema,
        (positions) => ({
          ...positions,
          [id]: { x: center.x - NODE_WIDTH / 2, y: center.y },
        })
      )
      if (targetSchema === schema) {
        setSelectedId(id)
      } else {
        setPickedSchema(targetSchema)
      }
    }
    setTableRequest(null)
  }

  return { actions, submitColumn, submitTable }
}
