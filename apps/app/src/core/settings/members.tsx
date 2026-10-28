import { Cancel01Icon, UserRemove01Icon } from '@hugeicons/core-free-icons'
import type { WorkspaceRole } from '@tamery/shared/workspace'
import {
  canEditWorkspace,
  INVITABLE_ROLES,
  isDefaultWorkspaceMetadata,
  WORKSPACE_ROLES,
} from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamery/ui/components/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { useActiveWorkspace } from '~/core/workspace/hooks'
import type { Workspace } from '~/core/workspace/sync'
import { useIsAnonymous } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'
import { useIsOnline } from '~/store'

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  editor: 'Editor',
  owner: 'Owner',
  viewer: 'Viewer',
}

const roleLabel = (role: string) => ROLE_LABELS[role as WorkspaceRole] ?? role

const roleItems = (roles: readonly WorkspaceRole[]) =>
  roles.map((value) => ({ label: ROLE_LABELS[value], value }))

const RoleSelect = <TRole extends WorkspaceRole>({
  disabled,
  label,
  onChange,
  roles,
  size,
  value,
}: {
  disabled?: boolean
  label: string
  onChange: (role: TRole) => void
  roles: readonly TRole[]
  size: 'sm' | 'default'
  value: TRole
}) => (
  <Select
    items={roleItems(roles)}
    value={value}
    disabled={disabled}
    onValueChange={(next) => next && onChange(next)}
  >
    <SelectTrigger size={size} aria-label={label} className="w-24">
      <SelectValue />
    </SelectTrigger>
    <SelectContent size={size}>
      {roles.map((role) => (
        <SelectItem key={role} value={role}>
          {ROLE_LABELS[role]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

const InviteForm = ({
  disabled,
  onInvited,
  workspaceId,
}: {
  disabled: boolean
  onInvited: () => void
  workspaceId: string
}) => {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>('editor')
  const invite = useMutation({
    meta: { event: 'workspace_member_invited' },
    mutationFn: () =>
      orpc.workspaces.invite.call({ email: email.trim(), role, workspaceId }),
    onSuccess: () => {
      setEmail('')
      toast.success('Invitation sent')
      onInvited()
    },
  })

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        invite.mutate()
      }}
    >
      <Input
        type="email"
        aria-label="Email"
        placeholder="Email of a Tamery user"
        value={email}
        disabled={disabled}
        onChange={(event) => setEmail(event.target.value)}
        data-mask
      />
      <RoleSelect
        label="Role"
        roles={INVITABLE_ROLES}
        size="default"
        value={role}
        disabled={disabled}
        onChange={setRole}
      />
      <Button
        type="submit"
        disabled={disabled || !email.trim() || invite.isPending}
      >
        <LoadingContent loading={invite.isPending}>Invite</LoadingContent>
      </Button>
    </form>
  )
}

const leaveHint = ({
  isOnlyMember,
  isSoleOwner,
}: {
  isOnlyMember: boolean
  isSoleOwner: boolean
}) => {
  if (!isSoleOwner) {
    return 'Leave this workspace. Its connections disappear from your devices.'
  }
  if (isOnlyMember) {
    return 'You are the only member. Invite someone, make them an owner once they join, then you can leave.'
  }
  return 'Make another member an owner with the role picker on their row, then you can leave.'
}

const WorkspaceMembers = ({ workspace }: { workspace: Workspace }) => {
  const navigate = useNavigate()
  const isOnline = useIsOnline()
  const input = { workspaceId: workspace.id }
  const { data } = useQuery(orpc.workspaces.members.queryOptions({ input }))
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.workspaces.members.key({ input }),
    })

  const updateRole = useMutation({
    meta: { event: 'workspace_member_role_changed' },
    mutationFn: (change: { memberId: string; role: WorkspaceRole }) =>
      orpc.workspaces.updateMemberRole.call({ ...change, ...input }),
    onSettled: refresh,
  })
  const remove = useMutation({
    meta: { event: 'workspace_member_removed' },
    mutationFn: (memberId: string) =>
      orpc.workspaces.removeMember.call({ memberId, ...input }),
    onSettled: refresh,
  })
  const cancel = useMutation({
    meta: { event: 'workspace_invitation_canceled' },
    mutationFn: (invitationId: string) =>
      orpc.workspaces.cancelInvitation.call({ invitationId }),
    onSettled: refresh,
  })
  const leave = useMutation({
    meta: { event: 'workspace_left' },
    mutationFn: () => orpc.workspaces.leave.call(input),
    onSuccess: async () => {
      toast.success(`You left ${workspace.name}`)
      await navigate({ to: '/' })
    },
  })

  if (!data) {
    return isOnline ? null : (
      <SettingsGroup>
        <SettingsRow
          title="You're offline"
          description="Connect to the internet to see and manage members."
        />
      </SettingsGroup>
    )
  }

  const canManage = canEditWorkspace(workspace.role)
  const isOwner = workspace.role === 'owner'
  const isSoleOwner =
    isOwner && data.members.filter(({ role }) => role === 'owner').length === 1
  const canChange = (member: (typeof data.members)[number]) =>
    canManage && !member.isYou && (isOwner || member.role !== 'owner')

  return (
    <>
      {canManage && (
        <InviteForm
          workspaceId={workspace.id}
          disabled={!isOnline}
          onInvited={refresh}
        />
      )}
      <SettingsGroup title="Members">
        {data.members.map((member) => (
          <SettingsRow
            key={member.id}
            title={
              <span data-mask>
                {member.isYou ? `${member.name} (you)` : member.name}
              </span>
            }
            description={<span data-mask>{member.email}</span>}
          >
            {canChange(member) ? (
              <RoleSelect
                label={`Role of ${member.name}`}
                roles={isOwner ? WORKSPACE_ROLES : INVITABLE_ROLES}
                size="sm"
                value={member.role as WorkspaceRole}
                disabled={!isOnline}
                onChange={(role) =>
                  updateRole.mutate({ memberId: member.id, role })
                }
              />
            ) : (
              <span className="text-muted-foreground text-xs">
                {roleLabel(member.role)}
              </span>
            )}
            {member.isYou ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      variant="outline"
                      focusableWhenDisabled
                      disabled={!isOnline || isSoleOwner || leave.isPending}
                      onClick={() => leave.mutate()}
                    />
                  }
                >
                  Leave
                </TooltipTrigger>
                <TooltipContent>
                  {leaveHint({
                    isOnlyMember: data.members.length === 1,
                    isSoleOwner,
                  })}
                </TooltipContent>
              </Tooltip>
            ) : (
              canChange(member) && (
                <IconButton
                  icon={UserRemove01Icon}
                  label="Remove from workspace"
                  size="icon-xs"
                  variant="ghost-destructive"
                  disabled={!isOnline}
                  onClick={() => remove.mutate(member.id)}
                />
              )
            )}
          </SettingsRow>
        ))}
      </SettingsGroup>
      {canManage && data.invitations.length > 0 && (
        <SettingsGroup title="Invitations">
          {data.invitations.map((invitation) => (
            <SettingsRow
              key={invitation.id}
              title={<span data-mask>{invitation.email}</span>}
              description={`Invited as ${roleLabel(invitation.role).toLowerCase()}`}
            >
              <IconButton
                icon={Cancel01Icon}
                label="Cancel invitation"
                size="icon-xs"
                variant="ghost-destructive"
                disabled={!isOnline}
                onClick={() => cancel.mutate(invitation.id)}
              />
            </SettingsRow>
          ))}
        </SettingsGroup>
      )}
    </>
  )
}

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
