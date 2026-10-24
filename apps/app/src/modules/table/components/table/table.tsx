import { LayoutThreeColumnIcon } from '@hugeicons/core-free-icons'
import { enabledFilters } from '@tamery/shared/filters'
import { uppercaseFirst, pick } from '@tamery/shared/utils'
import { TableSkeleton } from '@tamery/table'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { useMountedEffect } from '@tamery/ui/hookas/use-mounted-effect'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { useSubscription } from 'seitu/react'

import { getCapabilities } from '~/core/catalog/capabilities'
import { useConnectionContext } from '~/core/connection/route'
import { resourceRowsQueryInfiniteOptions } from '~/core/queries/rows/list'
import { rowIdentity } from '~/core/queries/rows/shape'
import { resourceTablesAndSchemasQueryOptions } from '~/core/queries/tables/list'
import { DataGrid } from '~/core/table/data-grid'
import { isSaving, useTableSessionStore } from '~/core/table/session'
import { TableError } from '~/core/table/table-error'
import { tableTabId } from '~/core/tabs/ids'
import { posthog } from '~/lib/posthog'

import { useTableColumnsContext } from '../../lib/columns'
import { tableGridRef } from '../../lib/grid-ref'
import { stagedHistory, useStagedHistoryHotkeys } from '../../lib/history'
import { useFlashChangedCells, useSyncSelectionWithRows } from '../../lib/hooks'
import { useReferenceLabels } from '../../lib/labels'
import { rowSelection } from '../../lib/row-selection'
import { useStagedEdits } from '../../lib/staged-edits'
import { columnLayout, columnView, useTablePageStore } from '../../lib/store'
import { cellHop } from '../references/hops'
import { ReferencePeek, useReferencePeek } from '../references/reference-peek'
import { useColumnActions } from './column-actions'
import { TableBodyCell } from './table-body-cell'
import { tableCellMenu } from './table-cell-menu'
import {
  addColumnColumn,
  defaultSize,
  EndOfRows,
  NoRows,
  selectColumn,
  tableBar,
} from './table-chrome'
import { TableFieldLabel, TableHeaderCell } from './table-header-cell'
import { keysInRange } from './table-selection'
import { DocumentsSkeleton } from './table-skeleton'

export const Table = ({
  onAddColumn,
  schema,
  table,
}: {
  onAddColumn?: () => void
  schema: string
  table: string
}) => {
  const { connectionResource, dialect } = useConnectionContext()
  const { names } = getCapabilities(dialect)
  const { columns, isPending: isColumnsPending } = useTableColumnsContext()
  const store = useTablePageStore()
  const sessionStore = useTableSessionStore()
  const {
    columnOrder,
    columnSizes,
    columnLabels,
    hiddenColumns,
    pinnedColumns,
  } = useSubscription(store, {
    selector: (state) =>
      pick(state, [
        'columnLabels',
        'columnOrder',
        'columnSizes',
        'hiddenColumns',
        'pinnedColumns',
      ]),
  })
  const activeFilters = useSubscription(store, {
    selector: (state) => state.filters,
  })
  const orderBy = useSubscription(store, { selector: (state) => state.orderBy })
  const view = useSubscription(store, { selector: (state) => state.view })
  const hasChanges = useSubscription(sessionStore, {
    selector: (state) =>
      state.newRows.length > 0 || Object.keys(state.drafts).length > 0,
  })
  const saving = useSubscription(sessionStore, { selector: isSaving })
  const hasSelection = useSubscription(sessionStore, {
    selector: (state) => state.selected.length > 0,
  })
  const filters = enabledFilters(activeFilters)
  const {
    data: rows = [],
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isPending: isRowsPending,
  } = useInfiniteQuery(
    resourceRowsQueryInfiniteOptions({
      columns,
      connectionResource,
      query: { filters, orderBy },
      schema,
      table,
    })
  )
  const { data: isBaseTable } = useQuery({
    ...resourceTablesAndSchemasQueryOptions({ connectionResource }),
    select: (data) =>
      data.schemas
        .find((entry) => entry.name === schema)
        ?.tables.find((entry) => entry.name === table)?.type === 'table',
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const {
    close: closePeek,
    open: openPeek,
    target: peekTarget,
  } = useReferencePeek(scrollRef)

  const { pinned, reordered, visible } = columnView(
    columns,
    { columnOrder, hiddenColumns, pinnedColumns },
    view === 'grid'
  )
  const identityColumns = rowIdentity(columns, dialect).columns
  const isEditable = identityColumns.length > 0
  const canWriteRows = isEditable && !!isBaseTable
  const staged = useStagedEdits({
    columns,
    dialect,
    rows,
    visible,
  })

  const newRowValues = staged.rows.slice(0, staged.rows.length - rows.length)
  const labels = useReferenceLabels(
    visible,
    [...rows, ...newRowValues],
    columnLabels
  )

  useSyncSelectionWithRows(rows, identityColumns)
  useFlashChangedCells(rows, identityColumns)
  useStagedHistoryHotkeys(
    stagedHistory({ id: connectionResource.id, schema, table })
  )

  useMountedEffect(() => {
    scrollRef.current?.scrollTo({ behavior: 'smooth', top: 0 })
  }, [activeFilters, orderBy])

  const { getActions, dialogs } = useColumnActions({
    dialect,
    editable: !!isBaseTable && !!onAddColumn,
    schema,
    table,
  })

  if (isRowsPending || isColumnsPending) {
    return view === 'documents' ? (
      <DocumentsSkeleton selectable={isEditable} />
    ) : (
      <TableSkeleton selectable={isEditable} />
    )
  }
  if (error) {
    return <TableError error={error} />
  }
  if (visible.length === 0) {
    return (
      <IconEmpty
        icon={LayoutThreeColumnIcon}
        title={`No ${names.column}s to show`}
        description={`Every ${names.column} is hidden. Show some from the ${uppercaseFirst(names.column)}s menu.`}
      />
    )
  }

  return (
    <div className="relative size-full">
      <DataGrid
        bar={tableBar({
          canDelete: !!isBaseTable && hasSelection,
          hasChanges,
          keys: identityColumns,
          rows,
          schema,
          table,
        })}
        canEdit={staged.canEdit}
        dialect={dialect}
        focusKey={tableTabId(schema, table)}
        getValue={staged.getValue}
        onEdit={isEditable && !saving ? staged.edit : undefined}
        onExtendRows={
          isEditable
            ? (direction) =>
                sessionStore.set((state) =>
                  rowSelection.extend(state, {
                    direction,
                    keysInRange: keysInRange(rows, identityColumns),
                    rowCount: rows.length,
                  })
                )
            : undefined
        }
        onToggleRows={
          isEditable
            ? (rowIndexes) =>
                sessionStore.set((state) =>
                  rowSelection.toggle(
                    state,
                    rowIndexes
                      .map(staged.rowAt)
                      .flatMap((entry) =>
                        entry.kind === 'saved' ? [entry.keys] : []
                      )
                  )
                )
            : undefined
        }
        onPreview={(cell, element) => {
          const hop = cellHop(cell.column, staged.getValue(cell))
          if (hop) {
            openPeek(element, hop)
          }
        }}
        renderCell={(cell, geometry) => (
          <TableBodyCell
            cell={cell}
            geometry={geometry}
            dialect={dialect}
            labels={labels.get(cell.column.id)}
            entry={staged.rowAt(cell.rowIndex)}
            onPeek={openPeek}
          />
        )}
        renderLabel={(column) => (
          <TableFieldLabel column={column} {...getActions(column)} />
        )}
        getSize={(column) => columnSizes[column.id] ?? defaultSize(column)}
        cursorRef={tableGridRef}
        layout={view}
        pinned={pinned}
        scrollRef={scrollRef}
        rows={staged.rows}
        rowKey={isEditable ? staged.rowKey : undefined}
        columns={visible}
        isFetching={isFetching}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onReorder={(ids) => {
          posthog.capture('columns_reordered')
          columnLayout(store).reorder(reordered(ids))
        }}
        menuItems={(cell, element) =>
          tableCellMenu({
            actions: getActions(cell.column),
            canWriteRows,
            cell,
            element,
            isEditable,
            onPeek: openPeek,
            saving,
            sessionStore,
            staged,
            store,
          })
        }
        renderHeader={(column, header) => (
          <TableHeaderCell
            column={column}
            header={header}
            {...getActions(column)}
          />
        )}
        leading={
          isEditable
            ? selectColumn({
                entryAt: staged.rowAt,
                keys: identityColumns,
                rows,
              })
            : undefined
        }
        trailing={addColumnColumn(isBaseTable ? onAddColumn : undefined)}
        footer={
          staged.rows.length > 0 && <EndOfRows hasNextPage={hasNextPage} />
        }
      />
      {staged.rows.length === 0 && (
        <NoRows
          isDocuments={view === 'documents'}
          isFiltered={filters.length > 0}
        />
      )}
      {dialogs}
      <ReferencePeek target={peekTarget} onClose={closePeek} />
    </div>
  )
}
