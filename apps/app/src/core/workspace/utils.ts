import {
  EDITOR_ROLES,
  isDefaultWorkspaceMetadata,
} from '@tamery/shared/workspace'
import { type } from 'arktype'
import { createWebStorageValue } from 'seitu/web'
import { toast } from 'sonner'

import { getCollections } from '~/core/collections'
import { checkOrUpgrade } from '~/core/user/permissions'

import type { Workspace } from './sync'

export const VIEW_ONLY_MESSAGE =
  'You can only view this workspace. Switch to one you can edit to add a connection.'

export const isViewOnly = (workspace: Workspace | null) =>
  !!workspace && !EDITOR_ROLES.includes(workspace.role)

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

    return isViewOnly(current)
      ? (workspaces.find((workspace) =>
          isDefaultWorkspaceMetadata(workspace.metadata)
        ) ?? null)
      : current
  },
  set: (workspaceId: string) => {
    workspaceSelection.id.set(workspaceId)
  },
}

export const checkCanAddConnection = (count: number) => {
  if (
    isViewOnly(
      workspaceSelection.current(getCollections().workspacesCollection.toArray)
    )
  ) {
    toast.error(VIEW_ONLY_MESSAGE)
    return false
  }

  return checkOrUpgrade('connection.create', { count })
}
