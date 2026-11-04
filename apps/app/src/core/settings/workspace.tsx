import {
  isDefaultWorkspaceMetadata,
  MEMBER_MANAGER_ROLES,
} from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { useState } from 'react'

import { useActiveWorkspace } from '~/core/workspace/hooks'
import type { Workspace } from '~/core/workspace/sync'
import { WorkspaceGlyph } from '~/core/workspace/workspace-glyph'
import { WorkspaceNameDialog } from '~/core/workspace/workspace-name-dialog'
import { useIsAnonymous } from '~/lib/auth'
import { useIsOnline } from '~/store'

import { WorkspaceMembers } from './workspace-members'

const WorkspaceIdentity = ({ workspace }: { workspace: Workspace }) => {
  const isOnline = useIsOnline()
  const [renameOpen, setRenameOpen] = useState(false)

  return (
    <SettingsGroup>
      <SettingsRow
        icon={
          <WorkspaceGlyph
            workspace={workspace}
            className="size-8 rounded-lg text-sm"
          />
        }
        title={<span data-mask>{workspace.name}</span>}
      >
        {MEMBER_MANAGER_ROLES.includes(workspace.role) && (
          <Button
            size="sm"
            variant="outline"
            disabled={!isOnline}
            onClick={() => setRenameOpen(true)}
          >
            Rename
          </Button>
        )}
      </SettingsRow>
      <WorkspaceNameDialog
        workspace={workspace}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
    </SettingsGroup>
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
      {!isAnonymous && <WorkspaceIdentity workspace={workspace} />}
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
