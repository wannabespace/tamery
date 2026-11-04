import {
  Cancel01Icon,
  PlusSignIcon,
  UserRemove01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { WorkspaceRole } from '@tamery/shared/workspace'
import {
  EDITOR_ROLES,
  INVITABLE_ROLES,
  MEMBER_MANAGER_ROLES,
  WORKSPACE_ROLES,
} from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { IconButton } from '@tamery/ui/components/custom/icon-button'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamery/ui/components/tooltip'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { capitalCase } from 'change-case'
import { useState } from 'react'
import { toast } from 'sonner'

import type { Workspace } from '~/core/workspace/sync'
import { orpc } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'
import { useIsOnline } from '~/store'

import { InviteDialog } from './invite-dialog'
import type { MemberConfirmation } from './member-confirm-dialog'
import { MemberConfirmDialog } from './member-confirm-dialog'
import { RoleSelect } from './role-select'

export const WorkspaceMembers = ({ workspace }: { workspace: Workspace }) => {
  const navigate = useNavigate()
  const isOnline = useIsOnline()
  const input = { workspaceId: workspace.id }
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<MemberConfirmation | null>(
    null
  )
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

  const canManage = MEMBER_MANAGER_ROLES.includes(workspace.role)
  const isOwner = workspace.role === 'owner'
  const isSoleOwner =
    isOwner && data.members.filter(({ role }) => role === 'owner').length === 1
  const canChange = (member: (typeof data.members)[number]) =>
    canManage && !member.isYou && (isOwner || member.role !== 'owner')

  return (
    <>
      <InviteDialog
        workspace={workspace}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={refresh}
      />
      <SettingsGroup
        title={
          <span className="flex items-center justify-between">
            Members
            {canManage && (
              <Button
                size="xs"
                variant="outline"
                disabled={!isOnline}
                onClick={() => setInviteOpen(true)}
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                Invite
              </Button>
            )}
          </span>
        }
      >
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
                value={member.role}
                disabled={!isOnline}
                onChange={(role) =>
                  role === 'viewer' && EDITOR_ROLES.includes(member.role)
                    ? setConfirmation({ action: 'demote', member })
                    : updateRole.mutate({ memberId: member.id, role })
                }
              />
            ) : (
              <span className="text-muted-foreground text-xs">
                {capitalCase(member.role)}
              </span>
            )}
            {member.isYou && data.members.length > 1 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="sm"
                      variant="outline"
                      focusableWhenDisabled
                      disabled={!isOnline || isSoleOwner || leave.isPending}
                      onClick={() =>
                        setConfirmation({
                          action: 'leave',
                          member: { id: member.id, name: workspace.name },
                        })
                      }
                    />
                  }
                >
                  Leave
                </TooltipTrigger>
                <TooltipContent>
                  {isSoleOwner
                    ? 'Make another member an owner with the role picker on their row, then you can leave.'
                    : 'Leave this workspace. Its connections disappear from your devices.'}
                </TooltipContent>
              </Tooltip>
            )}
            {canChange(member) && (
              <IconButton
                icon={UserRemove01Icon}
                label="Remove from workspace"
                size="icon-xs"
                variant="ghost-destructive"
                disabled={!isOnline}
                onClick={() => setConfirmation({ action: 'remove', member })}
              />
            )}
          </SettingsRow>
        ))}
      </SettingsGroup>
      <MemberConfirmDialog
        confirmation={confirmation}
        onCancel={() => setConfirmation(null)}
        onConfirm={({ action, member }) => {
          if (action === 'leave') {
            leave.mutate()
          } else if (action === 'remove') {
            remove.mutate(member.id)
          } else {
            updateRole.mutate({ memberId: member.id, role: 'viewer' })
          }
        }}
      />
      {canManage && data.invitations.length > 0 && (
        <SettingsGroup title="Invitations">
          {data.invitations.map((invitation) => (
            <SettingsRow
              key={invitation.id}
              title={<span data-mask>{invitation.email}</span>}
              description={`Invited as ${capitalCase(invitation.role)}`}
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
