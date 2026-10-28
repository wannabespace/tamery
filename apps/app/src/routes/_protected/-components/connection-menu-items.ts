import {
  AppWindowIcon,
  Copy01Icon,
  Copy02Icon,
  DatabaseExportIcon,
  Delete02Icon,
  FolderTransferIcon,
  PencilEdit01Icon,
  Refresh01Icon,
  SquareUnlock01Icon,
} from '@hugeicons/core-free-icons'
import { SyncType } from '@tamery/shared/enums/sync-type'

import type { AppMenuNode } from '~/components/app-menu'
import type { Connection } from '~/core/connection/sync'
import type { Workspace } from '~/core/workspace/sync'

export const buildConnectionMenuItems = ({
  canEdit,
  canSend,
  connection,
  copyTargets,
  isOnline,
  moveTargets,
  onClearPassword,
  onCopy,
  onCopyDatabase,
  onCopyTo,
  onEdit,
  onMoveTo,
  onOpenInNewWindow,
  onRefresh,
  onRemove,
}: {
  canEdit: boolean
  canSend: boolean
  connection: Connection
  copyTargets: Workspace[]
  isOnline: boolean
  moveTargets: Workspace[]
  onClearPassword: () => void
  onCopy: () => void
  onCopyDatabase: (() => void) | null
  onCopyTo: (workspaceId: string) => void
  onEdit: () => void
  onMoveTo: (workspaceId: string) => void
  onOpenInNewWindow: (() => void) | null
  onRefresh: () => void
  onRemove: VoidFunction
}): AppMenuNode[] => [
  {
    label: 'Open in New Window',
    icon: AppWindowIcon,
    disabled: !onOpenInNewWindow,
    onSelect: () => onOpenInNewWindow?.(),
  },
  { type: 'separator' },
  {
    label: 'Edit',
    icon: PencilEdit01Icon,
    disabled: !canEdit,
    onSelect: onEdit,
  },
  {
    label: 'Refresh',
    icon: Refresh01Icon,
    disabled: !canSend,
    onSelect: onRefresh,
  },
  {
    label: 'Copy connection string',
    icon: Copy01Icon,
    onSelect: onCopy,
  },
  ...(onCopyDatabase
    ? ([
        {
          label: 'Copy database…',
          icon: DatabaseExportIcon,
          disabled: !canSend,
          onSelect: onCopyDatabase,
        },
      ] satisfies AppMenuNode[])
    : []),
  ...(moveTargets.length === 0
    ? ([
        {
          label: 'Duplicate',
          icon: Copy02Icon,
          disabled: !canEdit,
          onSelect: () => onCopyTo(connection.workspaceId),
        },
      ] satisfies AppMenuNode[])
    : ([
        {
          type: 'sub',
          label: 'Copy to',
          icon: Copy02Icon,
          items: copyTargets.map((workspace) => ({
            label: workspace.name,
            onSelect: () => onCopyTo(workspace.id),
          })),
        },
        {
          type: 'sub',
          label: 'Move to',
          icon: FolderTransferIcon,
          disabled: !canEdit || !isOnline,
          items: moveTargets.map((workspace) => ({
            label: workspace.name,
            onSelect: () => onMoveTo(workspace.id),
          })),
        },
      ] satisfies AppMenuNode[])),
  ...(connection.syncType === SyncType.CloudWithoutSecrets
    ? ([
        {
          label: 'Clear saved credentials',
          icon: SquareUnlock01Icon,
          className: 'whitespace-nowrap',
          onSelect: onClearPassword,
        },
      ] satisfies AppMenuNode[])
    : []),
  { type: 'separator' },
  {
    label: 'Remove',
    icon: Delete02Icon,
    variant: 'destructive',
    disabled: !canEdit,
    onSelect: onRemove,
  },
]
