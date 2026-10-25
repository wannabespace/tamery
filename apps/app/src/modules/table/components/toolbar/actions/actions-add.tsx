import {
  LayoutThreeColumnIcon,
  LayoutThreeRowIcon,
  PlusSignIcon,
  SproutIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'

import { useObjectNames } from '~/core/catalog/names'
import { useTableSessionStore } from '~/core/table/session'
import { posthog } from '~/lib/posthog'

import { useTableColumnsContext } from '../../../lib/columns'
import { stageRow } from '../../../lib/staged-edits'
import { columnView, useTablePageStore } from '../../../lib/store'

export const ActionsAdd = ({
  onAddColumn,
  onInsertDocument,
  onSeed,
}: {
  onAddColumn?: () => void
  onInsertDocument?: () => void
  onSeed: () => void
}) => {
  const store = useTablePageStore()
  const sessionStore = useTableSessionStore()
  const names = useObjectNames()
  const { columns } = useTableColumnsContext()
  const canAddRow = columns.some((column) => column.primaryKey)

  const addRow = () => {
    const state = store.get()
    stageRow(
      sessionStore,
      columnView(columns, state, state.view === 'grid').visible,
      {}
    )
    posthog.capture('row_added')
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          aria-label="Add"
          render={
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" />}
            />
          }
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        </TooltipTrigger>
        <TooltipContent side="bottom">Add</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem
          disabled={!onInsertDocument && !canAddRow}
          onClick={onInsertDocument ?? addRow}
        >
          <HugeiconsIcon icon={LayoutThreeRowIcon} strokeWidth={2} />
          Add {names.row}
        </DropdownMenuItem>
        {onAddColumn && (
          <DropdownMenuItem onClick={onAddColumn}>
            <HugeiconsIcon icon={LayoutThreeColumnIcon} strokeWidth={2} />
            Add column
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={columns.length === 0} onClick={onSeed}>
          <HugeiconsIcon icon={SproutIcon} strokeWidth={2} />
          Seed data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
