import type { InvitableRole } from '@tamery/shared/workspace'
import { INVITABLE_ROLES } from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { orpc } from '~/lib/orpc'

import { RoleSelect } from './role-select'

export const InviteForm = ({
  disabled,
  onInvited,
  workspaceId,
}: {
  disabled: boolean
  onInvited: () => void
  workspaceId: string
}) => {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitableRole>('editor')
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
