import { isDefaultWorkspaceMetadata } from '@tamery/shared/workspace'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'

import { useActiveWorkspace } from '~/core/workspace/hooks'
import { useIsAnonymous } from '~/lib/auth'

import { WorkspaceMembers } from './workspace-members'

export const MembersSettings = () => {
  const { data: workspace } = useActiveWorkspace()
  const isAnonymous = useIsAnonymous()

  if (!workspace) {
    return null
  }

  if (isAnonymous || isDefaultWorkspaceMetadata(workspace.metadata)) {
    return (
      <SettingsGroup>
        <SettingsRow
          title="Your Personal workspace is private"
          description="To work with others, create a workspace from the workspace menu, then invite people here."
        />
      </SettingsGroup>
    )
  }

  return <WorkspaceMembers workspace={workspace} />
}
