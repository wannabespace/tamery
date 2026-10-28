import { describeInvitation } from '@tamery/shared/workspace'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  getRouteApi,
  Link,
  redirect,
} from '@tanstack/react-router'

import { orpc } from '~/lib/orpc'
import { handleError } from '~/utils/error'

import { OpenStatus } from '../open-status'

const { useParams } = getRouteApi('/invitation/$invitationId')

const InvitationPage = () => {
  const { invitationId } = useParams()
  const { data: invitations } = useSuspenseQuery(
    orpc.workspaces.invitations.queryOptions()
  )
  const invitation = invitations.find(({ id }) => id === invitationId)
  const join = useMutation({
    meta: { event: 'workspace_invitation_accepted' },
    mutationFn: () => orpc.workspaces.acceptInvitation.call({ invitationId }),
    onError: handleError,
  })
  const decline = useMutation({
    meta: { event: 'workspace_invitation_declined' },
    mutationFn: () => orpc.workspaces.rejectInvitation.call({ invitationId }),
    onError: handleError,
  })
  const pending = join.isPending || decline.isPending

  if (!invitation) {
    return (
      <OpenStatus
        title="This invitation is no longer open"
        description="It was already answered, canceled, or it expired. Ask for a new one if you still need access."
      >
        <Button variant="outline" render={<Link to="/account" />}>
          Go to account
        </Button>
      </OpenStatus>
    )
  }

  const workspaceName = <span data-mask>{invitation.workspaceName}</span>

  if (join.isSuccess) {
    return (
      <OpenStatus
        title={<>You joined {workspaceName}</>}
        description="Its connections now appear in Tamery on all your devices, including the ones open right now."
      >
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<a href="tamery://" aria-label="Open desktop app" />}
          >
            Open desktop app
          </Button>
          <Button
            render={
              <a
                href={import.meta.env.VITE_PUBLIC_WEB_URL}
                aria-label="Open web app"
              />
            }
          >
            Open web app
          </Button>
        </div>
      </OpenStatus>
    )
  }

  if (decline.isSuccess) {
    return (
      <OpenStatus
        title="Invitation declined"
        description={
          <>
            You didn&apos;t join {workspaceName}. Its members can invite you
            again.
          </>
        }
      >
        <Button variant="outline" render={<Link to="/account" />}>
          Go to account
        </Button>
      </OpenStatus>
    )
  }

  return (
    <OpenStatus
      title={<>Join {workspaceName}</>}
      description={<span data-mask>{describeInvitation(invitation)}</span>}
    >
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => decline.mutate()}
        >
          <LoadingContent loading={decline.isPending}>Decline</LoadingContent>
        </Button>
        <Button disabled={pending} onClick={() => join.mutate()}>
          <LoadingContent loading={join.isPending}>Join</LoadingContent>
        </Button>
      </div>
    </OpenStatus>
  )
}

export const Route = createFileRoute('/invitation/$invitationId')({
  component: InvitationPage,
  head: () => ({
    meta: [
      { title: 'Workspace invitation - Tamery' },
      { content: 'noindex', name: 'robots' },
    ],
  }),
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        search: { redirectPath: location.pathname },
        to: '/sign-in',
      })
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...orpc.workspaces.invitations.queryOptions(),
      staleTime: 'static',
    })
  },
})
