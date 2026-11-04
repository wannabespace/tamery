import type { InvitableRole } from '@tamery/shared/workspace'
import { INVITABLE_ROLES } from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import type { Workspace } from '~/core/workspace/sync'
import { orpc } from '~/lib/orpc'

import { RoleSelect } from './role-select'

const InviteForm = ({
  onInvited,
  workspace,
}: {
  onInvited: () => void
  workspace: Workspace
}) => {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitableRole>('editor')
  const invite = useMutation({
    meta: { event: 'workspace_member_invited' },
    mutationFn: () =>
      orpc.workspaces.invite.call({
        email: email.trim(),
        role,
        workspaceId: workspace.id,
      }),
    onSuccess: () => {
      toast.success('Invitation sent')
      onInvited()
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Invite to <span data-mask>{workspace.name}</span>
        </DialogTitle>
      </DialogHeader>
      <form
        id="invite-form"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          invite.mutate()
        }}
      >
        <Input
          autoFocus
          type="email"
          aria-label="Email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-mask
        />
        <RoleSelect
          label="Role"
          roles={INVITABLE_ROLES}
          size="default"
          value={role}
          onChange={setRole}
        />
      </form>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button
          type="submit"
          form="invite-form"
          disabled={!email.trim() || invite.isPending}
        >
          <LoadingContent loading={invite.isPending}>Invite</LoadingContent>
        </Button>
      </DialogFooter>
    </>
  )
}

export const InviteDialog = ({
  onInvited,
  onOpenChange,
  open,
  workspace,
}: {
  onInvited: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  workspace: Workspace
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <InviteForm
        workspace={workspace}
        onInvited={() => {
          onInvited()
          onOpenChange(false)
        }}
      />
    </DialogContent>
  </Dialog>
)
