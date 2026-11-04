import { FileExportIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { NumberFlow } from '@tamery/ui/components/custom/number-flow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tamery/ui/components/dropdown-menu'
import { useSubscription } from 'seitu/react'

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
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost-muted"
            size="sm"
            aria-label={`Export (${ticked.length})`}
            disabled={isPending}
          />
        }
      >
        <LoadingContent loading={isPending}>
          <HugeiconsIcon icon={FileExportIcon} strokeWidth={2} />
        </LoadingContent>
        <span>
          Export (
          <NumberFlow spinTiming={{ duration: 200 }} value={ticked.length} />)
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top">
        <ExportFormatItems onExport={mutate} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
