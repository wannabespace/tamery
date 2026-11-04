import { FileExportIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useSubscription } from 'seitu/react'

import { useObjectNames } from '~/core/catalog/names'
import { ExportFormatItems, useExportMutation } from '~/core/export/export-data'
import {
  getRowKeyByPrimaryKeys,
  primaryKeysKey,
  useTableSessionStore,
} from '~/core/table/session'

export const ActionsExport = ({
  filename,
  keys,
  rows,
}: {
  filename: string
  keys: string[]
  rows: Record<string, unknown>[]
}) => {
  const names = useObjectNames()
  const selected = useSubscription(useTableSessionStore(), {
    selector: (state) => state.selected,
  })
  const selectedKeys = new Set(selected.map(primaryKeysKey))
  const ticked = rows.filter((row) =>
    selectedKeys.has(getRowKeyByPrimaryKeys(row, keys))
  )
  const { isPending, mutate } = useExportMutation({
    filename,
    getData: () => Promise.resolve(ticked),
  })

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost-muted"
                  size="icon-sm"
                  aria-label={`Export selected ${names.row}s`}
                  disabled={isPending}
                />
              }
            />
          }
        >
          <LoadingContent loading={isPending}>
            <HugeiconsIcon icon={FileExportIcon} strokeWidth={2} />
          </LoadingContent>
        </TooltipTrigger>
        <TooltipContent>Export selected {names.row}s</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top">
        <ExportFormatItems onExport={mutate} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
