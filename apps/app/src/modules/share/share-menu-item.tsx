import { Share08Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DropdownMenuItem } from '@tamery/ui/components/dropdown-menu'

import { useTableShare } from './use-table-share'

export const ShareMenuItem = ({
  onOpen,
  schema,
  table,
}: {
  onOpen: () => void
  schema: string
  table: string
}) => {
  const { editable, loaded, synced } = useTableShare(schema, table)
  const hint = synced ? !editable && 'Editors only' : 'Needs Full sync'

  return (
    <DropdownMenuItem disabled={!!hint || !loaded} onClick={onOpen}>
      <HugeiconsIcon icon={Share08Icon} strokeWidth={2} />
      Share
      {hint && (
        <span className="text-muted-foreground ml-auto text-xs">{hint}</span>
      )}
    </DropdownMenuItem>
  )
}
