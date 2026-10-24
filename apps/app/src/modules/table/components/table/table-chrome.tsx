import {
  MoreHorizontalIcon,
  PlusSignIcon,
  TableIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GridRow } from '@tamery/table'
import { getColumnSize } from '@tamery/table'
import { LEADING_COLUMN_SIZE } from '@tamery/table/constants'
import { Button } from '@tamery/ui/components/button'
import { IconEmpty } from '@tamery/ui/components/custom/icon-empty'
import { Spinner } from '@tamery/ui/components/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { cn } from '@tamery/ui/lib/utils'

import { useObjectNames } from '~/core/catalog/names'
import type { Column } from '~/core/table/cell/utils'
import { INTERNAL_COLUMN_IDS } from '~/core/table/cell/utils'
import type { ExtraColumn } from '~/core/table/column-grid'
import type { GridBarItem } from '~/core/table/grid-bar'
import type { GridEntry } from '~/core/table/session'

import { ActionsDelete } from './actions-delete'
import { DraftsActions } from './drafts-actions'
import { LeadingCell, LeadingHeaderCell } from './table-selection'

const TRAILING_COLUMN_SIZE = 48
const REFERENCE_BUTTON_WIDTH = 24

export const defaultSize = (column: Column) =>
  getColumnSize(column.type ?? null) +
  (column.foreign ? REFERENCE_BUTTON_WIDTH : 0) +
  (column.references?.length ? REFERENCE_BUTTON_WIDTH : 0)

export const selectColumn = ({
  entryAt,
  keys,
  rows,
}: {
  entryAt: (rowIndex: number) => GridEntry
  keys: string[]
  rows: GridRow[]
}): ExtraColumn => ({
  id: INTERNAL_COLUMN_IDS.SELECT,
  renderCell: ({ rowIndex, style }) => (
    <LeadingCell
      entry={entryAt(rowIndex)}
      keys={keys}
      rowIndex={rowIndex}
      rows={rows}
      style={style}
    />
  ),
  renderHeader: ({ style }) => (
    <LeadingHeaderCell keys={keys} rows={rows} style={style} />
  ),
  size: LEADING_COLUMN_SIZE,
})

export const addColumnColumn = (onAddColumn?: () => void): ExtraColumn => ({
  id: INTERNAL_COLUMN_IDS.ACTIONS,
  renderCell: ({ style }) => <div aria-hidden style={style} />,
  renderHeader: ({ style }) => (
    <div className="flex items-center px-2" style={style}>
      {onAddColumn && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost-muted"
                size="icon-xs"
                aria-label="Add column"
                tabIndex={-1}
                onClick={onAddColumn}
              />
            }
          >
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          </TooltipTrigger>
          <TooltipContent side="bottom">Add column</TooltipContent>
        </Tooltip>
      )}
    </div>
  ),
  size: TRAILING_COLUMN_SIZE,
})

export const tableBar = ({
  canDelete,
  hasChanges,
  keys,
  rows,
  schema,
  table,
}: {
  canDelete: boolean
  hasChanges: boolean
  keys: string[]
  rows: GridRow[]
  schema: string
  table: string
}): GridBarItem[] => [
  ...(canDelete
    ? [
        {
          content: <ActionsDelete keys={keys} rows={rows} />,
          id: 'delete',
        },
      ]
    : []),
  ...(hasChanges
    ? [
        {
          content: <DraftsActions table={table} schema={schema} />,
          id: 'drafts',
        },
      ]
    : []),
]

export const EndOfRows = ({ hasNextPage }: { hasNextPage: boolean }) => {
  const names = useObjectNames()
  return (
    <div className="pointer-events-none sticky left-0 flex h-80 w-[100cqw] items-center justify-center">
      {hasNextPage ? (
        <Spinner />
      ) : (
        <IconEmpty
          icon={MoreHorizontalIcon}
          title={`No more ${names.row}s`}
          description={`You've reached the end of this ${names.table}.`}
        />
      )}
    </div>
  )
}

export const NoRows = ({
  isDocuments,
  isFiltered,
}: {
  isDocuments: boolean
  isFiltered: boolean
}) => {
  const names = useObjectNames()
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 flex',
        isDocuments ? 'top-0' : 'top-8'
      )}
    >
      <IconEmpty
        icon={TableIcon}
        title={`No ${names.row}s`}
        description={
          isFiltered
            ? 'Nothing matches the current filters.'
            : `This ${names.table} is empty.`
        }
      />
    </div>
  )
}
