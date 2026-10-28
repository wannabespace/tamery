import {
  EDITOR_ROLES,
  isDefaultWorkspaceMetadata,
} from '@tamery/shared/workspace'
import { type } from 'arktype'
import { createWebStorageValue } from 'seitu/web'

import type { Workspace } from './sync'

export const workspaceSelection = {
  current: (workspaces: Workspace[]) =>
    workspaceSelection.resolve(workspaces, workspaceSelection.id.get()),
  id: createWebStorageValue({
    defaultValue: null,
    key: 'tamery.active-workspace-id',
    schema: type('string | null'),
    type: 'localStorage',
  }),
  resolve: (workspaces: Workspace[], activeId: string | null) =>
    workspaces.find((workspace) => workspace.id === activeId) ??
    workspaces.find((workspace) =>
      isDefaultWorkspaceMetadata(workspace.metadata)
    ) ??
    workspaces.at(0) ??
    null,
  /** Where a new connection lands: the active workspace, or Personal when the user only views it, since the server rejects a workspace the user cannot edit. */
  target: (workspaces: Workspace[]) => {
    const current = workspaceSelection.current(workspaces)

    return current && EDITOR_ROLES.includes(current.role)
      ? current
      : (workspaces.find((workspace) =>
          isDefaultWorkspaceMetadata(workspace.metadata)
        ) ?? null)
  },
  set: (workspaceId: string) => {
    workspaceSelection.id.set(workspaceId)
  },
}
