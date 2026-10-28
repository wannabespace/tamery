import { describeInvitation } from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useSubscription } from 'seitu/react'
import { toast } from 'sonner'

import {
  openedInvitationId,
  useInvitations,
} from '~/core/workspace/invitations'
import { workspaceSelection } from '~/core/workspace/utils'
import { orpc } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'

const close = () => openedInvitationId.set(null)

const settle = () => {
  close()
  return queryClient.invalidateQueries({
    queryKey: orpc.workspaces.invitations.key(),
  })
}

export const WorkspaceInvitationDialog = () => {
  const navigate = useNavigate()
  const openedId = useSubscription(openedInvitationId)
  const invitation = useInvitations().find(({ id }) => id === openedId) ?? null
  const [shown, setShown] = useState(invitation)
  if (invitation && invitation !== shown) {
    setShown(invitation)
  }

  const accept = useMutation({
    meta: { event: 'workspace_invitation_accepted' },
    mutationFn: (invitationId: string) =>
      orpc.workspaces.acceptInvitation.call({ invitationId }),
    onSettled: settle,
    onSuccess: async ({ workspaceId }) => {
      workspaceSelection.set(workspaceId)
      toast.success(`You joined ${shown?.workspaceName}`)
      await navigate({ to: '/' })
    },
  })
  const decline = useMutation({
    meta: { event: 'workspace_invitation_declined' },
    mutationFn: (invitationId: string) =>
      orpc.workspaces.rejectInvitation.call({ invitationId }),
    onSettled: settle,
  })
  const pending = accept.isPending || decline.isPending

  return (
    <Dialog
      open={!!invitation}
      onOpenChange={(open) => !open && close()}
      onOpenChangeComplete={(open) => !open && setShown(null)}
    >
      {shown && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Join <span data-mask>{shown.workspaceName}</span>
            </DialogTitle>
            <DialogDescription data-mask>
              {describeInvitation(shown)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => decline.mutate(shown.id)}
            >
              <LoadingContent loading={decline.isPending}>
                Decline
              </LoadingContent>
            </Button>
            <Button disabled={pending} onClick={() => accept.mutate(shown.id)}>
              <LoadingContent loading={accept.isPending}>Join</LoadingContent>
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
