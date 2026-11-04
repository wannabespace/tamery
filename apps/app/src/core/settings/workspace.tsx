import {
  isDefaultWorkspaceMetadata,
  MEMBER_MANAGER_ROLES,
} from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { useActiveWorkspace } from '~/core/workspace/hooks'
import type { Workspace } from '~/core/workspace/sync'
import { useIsAnonymous } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { useIsOnline } from '~/store'

import { WorkspaceMembers } from './workspace-members'

const WorkspaceName = ({ workspace }: { workspace: Workspace }) => {
  const isOnline = useIsOnline()
  const [draft, setDraft] = useState<string | null>(null)
  const name = draft ?? workspace.name
  const trimmedName = name.trim()
  const canRename = MEMBER_MANAGER_ROLES.includes(workspace.role)
  const rename = useMutation({
    meta: { event: 'workspace_renamed' },
    mutationFn: () =>
      orpc.workspaces.rename.call({
        name: trimmedName,
        workspaceId: workspace.id,
      }),
    onSuccess: () => {
      setDraft(null)
      toast.success('Workspace renamed')
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        rename.mutate()
      }}
    >
      <SettingsGroup>
        <SettingsRow
          title="Name"
          description={
            canRename
              ? undefined
              : 'Only owners and admins can rename this workspace.'
          }
        >
          <Input
            aria-label="Workspace name"
            className="w-56"
            value={name}
            disabled={!canRename}
            onChange={(event) => setDraft(event.target.value)}
            data-mask
          />
          {canRename && (
            <Button
              type="submit"
              disabled={
                !isOnline ||
                !trimmedName ||
                trimmedName === workspace.name ||
                rename.isPending
              }
            >
              <LoadingContent loading={rename.isPending}>Save</LoadingContent>
            </Button>
          )}
        </SettingsRow>
      </SettingsGroup>
    </form>
  )
}

export const WorkspaceSettings = () => {
  const { data: workspace } = useActiveWorkspace()
  const isAnonymous = useIsAnonymous()

  if (!workspace) {
    return null
  }

  return (
    <>
      {!isAnonymous && (
        <WorkspaceName key={workspace.id} workspace={workspace} />
      )}
      {isAnonymous || isDefaultWorkspaceMetadata(workspace.metadata) ? (
        <SettingsGroup>
          <SettingsRow
            title="Your personal workspace is private"
            description="To work with others, create a workspace from the workspace menu, then invite people here."
          />
        </SettingsGroup>
      ) : (
        <WorkspaceMembers workspace={workspace} />
      )}
    </>
  )
}
