import {
  isDefaultWorkspaceMetadata,
  MEMBER_MANAGER_ROLES,
} from '@tamery/shared/workspace'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { useActiveWorkspace } from '~/core/workspace/hooks'
import type { Workspace } from '~/core/workspace/sync'
import { useIsAnonymous } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { useIsOnline } from '~/store'

import { WorkspaceMembers } from './workspace-members'

const WorkspaceName = ({ workspace }: { workspace: Workspace }) => {
  const isOnline = useIsOnline()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const canRename = MEMBER_MANAGER_ROLES.includes(workspace.role)
  const rename = useMutation({
    meta: { event: 'workspace_renamed' },
    mutationFn: (name: string) =>
      orpc.workspaces.rename.call({ name, workspaceId: workspace.id }),
    onSettled: () => setDraft(null),
    onSuccess: () => toast.success('Workspace renamed'),
  })

  const commit = () => {
    const name = draft?.trim()
    if (name && name !== workspace.name) {
      rename.mutate(name)
    } else {
      setDraft(null)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        inputRef.current?.blur()
      }}
    >
      <SettingsGroup>
        <SettingsRow
          htmlFor="workspace-name"
          title="Name"
          description={
            canRename
              ? undefined
              : 'Only owners and admins can rename this workspace.'
          }
        >
          <Input
            ref={inputRef}
            id="workspace-name"
            autoComplete="off"
            className="w-56"
            value={draft ?? workspace.name}
            disabled={!(canRename && isOnline) || rename.isPending}
            onBlur={commit}
            onChange={(event) => setDraft(event.target.value)}
            data-mask
          />
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
