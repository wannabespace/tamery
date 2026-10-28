import { useHotkey, useHotkeys } from '@tanstack/react-hotkeys'
import { useQuery } from '@tanstack/react-query'
import { useReactFlow } from '@xyflow/react'
import { useRef, useState } from 'react'
import { useSubscription } from 'seitu/react'

import type { TableType } from '~/core/catalog/table-type'
import { useConnectionContext } from '~/core/connection/route'
import { diagramDrafts, diagramDraftsStore } from '~/core/drafts/diagram'
import { useShortcut } from '~/core/keyboard/use-shortcuts'
import type { constraintsType } from '~/core/queries/constraints/list'
import { resourceIndexesQueryOptions } from '~/core/queries/indexes/list'
import { resourcePoliciesQueryOptions } from '~/core/queries/policies/list'
import type { columnType } from '~/core/queries/tables/columns'
import { resourceTriggersQueryOptions } from '~/core/queries/triggers/list'
import type { ColumnDialogRequest } from '~/core/table/column-dialog'
import { ColumnDialog } from '~/core/table/column-dialog'
import type { TableDialogRequest } from '~/core/table/table-dialog'
import { TableDialog } from '~/core/table/table-dialog'

import { useDiagramActions } from '../lib/actions'
import { useApplyDrafts } from '../lib/apply'
import type { DiagramContextValue } from '../lib/context'
import { DiagramContext, diagramViewStore, getGates } from '../lib/context'
import { fitViewOptions, usePositions } from '../lib/layout'
import { visualizerLayout, visualizerStore } from '../lib/positions'
import type { DiagramColumn, DiagramTable } from '../lib/schema'
import { buildDiagram, tableNodeId } from '../lib/schema'
import { Canvas } from './canvas'
import { InspectorPane } from './inspector'
import { ReviewDrawer } from './review-drawer'
import { Toolbar } from './toolbar'

const noRows: never[] = []

export const Visualizer = ({
  columns,
  constraints,
  tables,
}: {
  columns: (typeof columnType.infer)[]
  constraints: (typeof constraintsType.infer)[]
  tables: { schema: string; table: string; type: TableType }[]
}) => {
  const { connectionResource, defaultSchema, dialect } = useConnectionContext()
  const flow = useReactFlow()
  const draftsStore = diagramDraftsStore(connectionResource.id)
  const drafts = useSubscription(draftsStore, {
    isEqual: Object.is,
    selector: (state) => state.drafts,
  })
  const edit = diagramDrafts(draftsStore)
  const can = getGates(dialect)

  const schemas = [
    ...new Set([
      ...tables.map(({ schema }) => schema),
      ...drafts.map((draft) => draft.schema),
    ]),
  ]
  if (schemas.length === 0 && defaultSchema) {
    schemas.push(defaultSchema)
  }
  const tableIds = new Set([
    ...tables.map((entry) => tableNodeId(entry.schema, entry.table)),
    ...drafts.flatMap((draft) => {
      if (draft.kind === 'createTable') {
        return [tableNodeId(draft.schema, draft.table)]
      }
      if (draft.kind === 'renameTable') {
        return [tableNodeId(draft.schema, draft.newName)]
      }
      return []
    }),
  ])
  const [pickedSchema, setPickedSchema] = useState<string>()
  const schema =
    [pickedSchema, defaultSchema].find(
      (name) => name && schemas.includes(name)
    ) ??
    schemas[0] ??
    ''

  const { data: indexes = noRows } = useQuery({
    ...resourceIndexesQueryOptions({ connectionResource }),
    enabled: can.indexes,
  })
  const { data: triggers = noRows } = useQuery({
    ...resourceTriggersQueryOptions({ connectionResource }),
    enabled: can.triggers,
  })
  const { data: policies = noRows } = useQuery({
    ...resourcePoliciesQueryOptions({ connectionResource }),
    enabled: can.policies,
  })

  const diagram = buildDiagram({
    columns,
    constraints,
    drafts,
    indexes,
    policies,
    schema,
    tables,
    triggers,
  })
  const layout = usePositions(connectionResource.id, schema, diagram)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tableRequest, setTableRequest] =
    useState<TableDialogRequest<DiagramTable> | null>(null)
  const [columnRequest, setColumnRequest] = useState<ColumnDialogRequest<
    DiagramTable,
    DiagramColumn
  > | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedTable =
    diagram.tables.find((table) => table.id === selectedId) ?? null
  const selectedRelation = diagram.relations.find(
    (relation) => relation.id === selectedEdgeId
  )
  const idle = !tableRequest && !columnRequest && !reviewOpen

  const { actions, submitColumn, submitTable } = useDiagramActions({
    constraints,
    diagram,
    drafts,
    edit,
    schema,
    setColumnRequest,
    setPickedSchema,
    setSelectedId,
    setTableRequest,
  })

  const apply = useApplyDrafts({
    drafts,
    edit,
    onApplied: (applied) => {
      layout.settle(applied)
      setSelectedId(null)
    },
    reviewOpen,
    setReviewOpen,
  })

  useShortcut('search', () => searchRef.current?.focus())
  useHotkey(
    'Escape',
    () => {
      if (search) {
        setSearch('')
        return
      }
      searchRef.current?.blur()
    },
    { target: searchRef }
  )
  useHotkey(
    'Escape',
    () => {
      if (selectedRelation) {
        setSelectedEdgeId(null)
        return
      }
      setSelectedId(null)
    },
    {
      enabled: (!!selectedRelation || selectedId !== null) && idle,
      target: rootRef,
    }
  )
  useHotkeys(
    (['Backspace', 'Delete'] as const).map((hotkey) => ({
      callback: () => {
        if (selectedRelation) {
          actions.dropRelation(selectedRelation)
          setSelectedEdgeId(null)
        }
      },
      hotkey,
    })),
    { enabled: !!selectedRelation && can.dropForeignKeys && idle }
  )

  const context: DiagramContextValue = {
    actions,
    can,
    diagram,
    search: search.trim().toLowerCase(),
    selectedId,
    view: diagramViewStore(connectionResource.id),
  }

  return (
    <DiagramContext value={context}>
      <div
        ref={rootRef}
        className="relative flex size-full min-h-0 flex-1 overflow-hidden rounded-lg"
      >
        <div className="relative min-w-0 flex-1">
          <Toolbar
            applying={apply.applying}
            drafts={drafts}
            onApply={() => apply.request()}
            onReview={() => setReviewOpen(true)}
            onSchemaChange={(next) => {
              setPickedSchema(next)
              setSelectedId(null)
              setSelectedEdgeId(null)
              layout.setDragged({})
              setSearch('')
            }}
            onSearchChange={setSearch}
            schema={schema}
            schemas={schemas}
            search={search}
            searchRef={searchRef}
          />
          <Canvas
            key={schema}
            defaultViewport={
              visualizerStore(connectionResource.id).get().viewports[schema]
            }
            positions={layout.positions}
            selectedEdgeId={selectedEdgeId}
            onEdgeSelect={setSelectedEdgeId}
            onPositionsChange={(next) => layout.setDragged(next)}
            onPositionsCommit={(next) => layout.commit(next)}
            onResetLayout={() => {
              layout.arrange()
              void flow.fitView({ ...fitViewOptions, duration: 300 })
            }}
            onViewportChange={(viewport) =>
              visualizerLayout.setViewport(
                connectionResource.id,
                schema,
                viewport
              )
            }
          />
        </div>
        <InspectorPane
          table={selectedTable}
          indexes={diagram.indexes}
          triggers={triggers}
          policies={policies}
          onClose={() => setSelectedId(null)}
        />
      </div>
      <TableDialog
        request={tableRequest}
        schemas={schemas}
        isTaken={(targetSchema, name) =>
          name !== tableRequest?.table?.table &&
          tableIds.has(tableNodeId(targetSchema, name))
        }
        onOpenChange={(open) => !open && setTableRequest(null)}
        onSubmit={submitTable}
      />
      <ColumnDialog
        request={columnRequest}
        onOpenChange={(open) => !open && setColumnRequest(null)}
        onSubmit={submitColumn}
      />
      <ReviewDrawer
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onOpenChangeComplete={(open) => !open && apply.reset()}
        dialect={dialect}
        ddlRollback={can.ddlRollback}
        drafts={drafts}
        error={apply.error}
        applying={apply.applying}
        onApply={() => apply.request()}
        onDiscard={(id) => edit.remove(id)}
        onDiscardAll={() => {
          edit.clear()
          setReviewOpen(false)
        }}
      />
    </DiagramContext>
  )
}
