import { pick } from '@tamery/shared/utils'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { useSubscription } from 'seitu/react'

import { useObjectNames } from '~/core/catalog/names'
import { useConnectionContext } from '~/core/connection/route'
import { DiscardButton } from '~/core/drafts/discard-button'
import { ChangeGroup, StagedReviewDrawer } from '~/core/drafts/review-drawer'
import { resourceRowsQueryInfiniteOptions } from '~/core/queries/rows/list'
import { rowIdentity } from '~/core/queries/rows/shape'
import {
  draftsActions,
  getRowKeyByPrimaryKeys,
  newRowsActions,
  primaryKeysKey,
  useTableSessionStore,
} from '~/core/table/session'
import { createTransformer } from '~/core/transformers/create-transformer'
import { getDisplayValue } from '~/core/transformers/value-transformer'
import { plural } from '~/utils/plural'

import { useTableColumnsContext } from '../../lib/columns'
import { tableGridRef } from '../../lib/grid-ref'
import { useTablePageStore } from '../../lib/store'
import {
  ChangeList,
  DraftChange,
  NewRowValues,
  RowError,
} from './draft-changes'

export const DraftsReviewDrawer = ({
  open,
  onOpenChange,
  table,
  schema,
  isSaving,
  onSave,
  onDiscardAll,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: string
  schema: string
  isSaving: boolean
  onSave: () => void
  onDiscardAll: () => void
}) => {
  const names = useObjectNames()
  const { connectionResource, dialect } = useConnectionContext()
  const { columns } = useTableColumnsContext()
  const columnsById = new Map(columns.map((column) => [column.id, column]))
  const identityColumns = rowIdentity(columns, dialect).columns
  const store = useTablePageStore()
  const sessionStore = useTableSessionStore()
  const drafts = useSubscription(sessionStore, {
    selector: (state) => Object.values(state.drafts),
  })
  const newRows = useSubscription(sessionStore, {
    selector: (state) => state.newRows,
  })
  const changeCount = drafts.length + newRows.length
  const { filters, orderBy } = useSubscription(store, {
    selector: (state) => pick(state, ['filters', 'orderBy']),
  })
  const { discard, discardRow } = draftsActions(sessionStore)
  const listRef = useRef<HTMLDivElement>(null)
  const jumpTarget = useRef<{ column: string; row: string } | null>(null)

  const { data: rows = [] } = useInfiniteQuery(
    resourceRowsQueryInfiniteOptions({
      columns,
      connectionResource,
      query: { filters, orderBy },
      schema,
      table,
    })
  )

  const rowsByPrimaryKey = new Map(
    rows.map(
      (row, index) =>
        [getRowKeyByPrimaryKeys(row, identityColumns), { index, row }] as const
    )
  )
  const rowIndex = (key: string) =>
    rowsByPrimaryKey.get(key)?.index ?? Number.MAX_SAFE_INTEGER
  const groups = [
    ...Map.groupBy(drafts, (draft) => primaryKeysKey(draft.primaryKeys)),
  ].toSorted(([a], [b]) => rowIndex(a) - rowIndex(b))

  const columnDisplay = (columnId: string, value: unknown) => {
    const column = columnsById.get(columnId)
    return column
      ? createTransformer(dialect, column).toDisplay(
          value,
          Number.POSITIVE_INFINITY
        )
      : getDisplayValue(value, Number.POSITIVE_INFINITY)
  }

  const jump = (position: { column: string; row: string }) => {
    jumpTarget.current = position
    tableGridRef.current?.reveal(position)
    onOpenChange(false)
  }

  return (
    <StagedReviewDrawer
      open={open}
      onOpenChange={onOpenChange}
      busy={isSaving}
      count={changeCount}
      description={
        <>
          {plural(changeCount, 'change')} in{' '}
          <span data-mask className="font-mono">
            {schema}.{table}
          </span>
        </>
      }
      emptyDescription={`Edit cells in the ${names.table} and the changes will show up here.`}
      onDiscardAll={onDiscardAll}
      onSubmit={onSave}
      submit={{
        label: `Save ${plural(changeCount, 'change')}`,
        tooltip: 'Save in one transaction',
      }}
      contentProps={{
        className: 'w-lg',
        finalFocus: () => {
          const target = jumpTarget.current
          jumpTarget.current = null
          if (!target) {
            if (changeCount === 0) {
              tableGridRef.current?.focus()
            }
            return changeCount > 0
          }
          tableGridRef.current?.reveal(target)
          return false
        },
        initialFocus: () =>
          listRef.current?.querySelector<HTMLElement>('[data-change]') ?? true,
      }}
    >
      <ChangeList listRef={listRef} isSaving={isSaving}>
        {newRows.map((newRow) => (
          <ChangeGroup
            key={newRow.id}
            title={`New ${names.row}`}
            action={
              <DiscardButton
                label={`Discard ${names.row}`}
                onClick={() => newRowsActions(sessionStore).discard(newRow.id)}
                disabled={isSaving}
              />
            }
          >
            <NewRowValues
              columns={columns}
              display={columnDisplay}
              newRow={newRow}
              onJump={(column) => jump({ column, row: newRow.id })}
            />
          </ChangeGroup>
        ))}
        {groups.map(([key, rowDrafts]) => {
          const primaryKeys = rowDrafts[0]?.primaryKeys ?? {}
          const loaded = rowsByPrimaryKey.get(key)
          const rowLabel = Object.entries(primaryKeys)
            .map(
              ([columnId, value]) =>
                `${columnId} = ${columnDisplay(columnId, value)}`
            )
            .join(' · ')

          return (
            <ChangeGroup
              key={key}
              title={
                <span data-mask title={rowLabel} className="font-mono">
                  {rowLabel}
                </span>
              }
              action={
                <DiscardButton
                  label={`Discard ${names.row}`}
                  onClick={() => discardRow(primaryKeys)}
                  disabled={isSaving}
                />
              }
            >
              {rowDrafts.map((draft) => {
                const original = loaded?.row[draft.columnId]
                return (
                  <DraftChange
                    key={draft.columnId}
                    column={columnsById.get(draft.columnId)}
                    draft={draft}
                    isSaving={isSaving}
                    before={{
                      display: loaded
                        ? columnDisplay(draft.columnId, original)
                        : '',
                      value: original,
                    }}
                    after={{
                      display: columnDisplay(draft.columnId, draft.value),
                      value: draft.value,
                    }}
                    onJump={() => jump({ column: draft.columnId, row: key })}
                    onDiscard={
                      rowDrafts.length > 1
                        ? () => discard(primaryKeys, draft.columnId)
                        : undefined
                    }
                  />
                )
              })}
              {rowDrafts[0]?.error && <RowError error={rowDrafts[0].error} />}
            </ChangeGroup>
          )
        })}
      </ChangeList>
    </StagedReviewDrawer>
  )
}
