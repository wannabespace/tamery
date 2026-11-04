import type { InvitableRole } from '@tamery/shared/workspace'
import { INVITABLE_ROLES } from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { InputGroup, InputGroupInput } from '@tamery/ui/components/input-group'
import { Item } from '@tamery/ui/components/item'
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
    <Item
      size="sm"
      variant="grouped"
      render={
        <form
          onSubmit={(event) => {
            event.preventDefault()
            invite.mutate()
          }}
        />
      }
    >
      <InputGroup variant="inset" className="-ml-2.5 flex-1">
        <InputGroupInput
          type="email"
          aria-label="Email"
          placeholder="Invite by email"
          value={email}
          disabled={disabled}
          onChange={(event) => setEmail(event.target.value)}
          data-mask
        />
      </InputGroup>
      <RoleSelect
        label="Role"
        roles={INVITABLE_ROLES}
        size="sm"
        variant="flat"
        value={role}
        disabled={disabled}
        onChange={setRole}
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={disabled || !email.trim() || invite.isPending}
      >
        <LoadingContent loading={invite.isPending}>Invite</LoadingContent>
      </Button>
    </Item>
  )
}
