import { ArrowTurnBackwardIcon } from '@hugeicons/core-free-icons'
import type { GridRow } from '@tamery/table'
import { Checkbox } from '@tamery/ui/components/checkbox'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import type { CSSProperties } from 'react'
import { useSubscription } from 'seitu/react'

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a virtualized flex grid cannot be built from table elements */
import { useObjectNames } from '~/core/catalog/names'
import { rowSelectId } from '~/core/table/cell/utils'
import type { GridEntry, PrimaryKeys } from '~/core/table/session'
import {
  getRowPrimaryKeysValues,
  isSaving,
  newRowsActions,
  primaryKeysKey,
  useTableSessionStore,
} from '~/core/table/session'

import { rowSelection, tickedRowCount } from '../../lib/row-selection'

export const keysInRange =
  (rows: GridRow[], keys: string[]) => (start: number, end: number) => [
    ...new Map(
      rows.slice(start, end + 1).map((row) => {
        const rowKey = getRowPrimaryKeysValues(row, keys)
        return [primaryKeysKey(rowKey), rowKey]
      })
    ).values(),
  ]

const SelectAll = ({ keys, rows }: { keys: string[]; rows: GridRow[] }) => {
  const names = useObjectNames()
  const store = useTableSessionStore()
  const selected = useSubscription(store, {
    selector: (state) => state.selected,
  })
  const ticked = tickedRowCount(selected, rows, keys)
  const checked = rows.length > 0 && ticked === rows.length

  return (
    <Checkbox
      aria-label={`Select all ${names.row}s`}
      tabIndex={-1}
      disabled={rows.length === 0}
      checked={checked}
      indeterminate={ticked > 0 && !checked}
      onCheckedChange={() =>
        store.set((state) => ({
          ...state,
          selected: checked ? [] : keysInRange(rows, keys)(0, rows.length - 1),
        }))
      }
    />
  )
}

export const LeadingHeaderCell = ({
  keys,
  rows,
  style,
}: {
  keys: string[]
  rows: GridRow[]
  style?: CSSProperties
}) => (
  <div
    role="columnheader"
    className="bg-background z-10 flex items-center justify-end pr-3"
    style={style}
  >
    <SelectAll keys={keys} rows={rows} />
  </div>
)

const SelectRow = ({
  id,
  keys,
  rowIndex,
  rowKey,
  rows,
}: {
  id: string
  keys: string[]
  rowIndex: number
  rowKey: PrimaryKeys
  rows: GridRow[]
}) => {
  const names = useObjectNames()
  const store = useTableSessionStore()
  const isSelected = useSubscription(store, {
    selector: (state) => rowSelection.has(state, rowKey),
  })

  return (
    <Checkbox
      id={id}
      aria-label={`Select ${names.row}`}
      tabIndex={-1}
      checked={isSelected}
      onCheckedChange={(_, { event }) =>
        store.set((state) =>
          rowSelection.click(state, {
            isShiftHeld: event instanceof MouseEvent && event.shiftKey,
            keysInRange: keysInRange(rows, keys),
            rowIndex,
            rowKey,
          })
        )
      }
    />
  )
}

const DiscardRow = ({ id }: { id: string }) => {
  const names = useObjectNames()
  const store = useTableSessionStore()
  const saving = useSubscription(store, { selector: isSaving })

  return (
    <IconButton
      variant="ghost-muted"
      size="icon-xs"
      className="-mr-1"
      icon={ArrowTurnBackwardIcon}
      label={`Discard ${names.row}`}
      tabIndex={-1}
      disabled={saving}
      onClick={() => newRowsActions(store).discard(id)}
    />
  )
}

export const LeadingCell = ({
  entry,
  keys,
  rowIndex,
  rows,
  style,
}: {
  entry: GridEntry
  keys: string[]
  rowIndex: number
  rows: GridRow[]
  style?: CSSProperties
}) => (
  <div
    role="gridcell"
    className="bg-background group-hover/row:bg-accent z-10 flex items-center justify-end pr-3"
    style={style}
  >
    {entry.kind === 'new' ? (
      <DiscardRow id={entry.newRow.id} />
    ) : (
      <SelectRow
        id={rowSelectId(rowIndex)}
        keys={keys}
        rowIndex={entry.index}
        rowKey={entry.keys}
        rows={rows}
      />
    )}
  </div>
)
