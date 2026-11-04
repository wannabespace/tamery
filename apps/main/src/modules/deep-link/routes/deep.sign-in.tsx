import { Button } from '@tamery/ui/components/button'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  getRouteApi,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { type } from 'arktype'

import { orpc } from '~/lib/orpc'

import { OpenStatus } from '../open-status'

const { useRouteContext, useSearch } = getRouteApi('/deep/sign-in')

const CLIENT_NAMES = {
  cli: 'the Tamery CLI',
  desktop: 'the Tamery desktop app',
}

const deviceQueryOptions = (codeChallenge: string) =>
  orpc.account.challenge.device.queryOptions({
    input: { codeChallenge },
    staleTime: 'static',
  })

const ConfirmSignIn = () => {
  const { codeChallenge } = useSearch()
  const { clientType, email } = useRouteContext()
  const navigate = useNavigate()
  const { data: device } = useSuspenseQuery(deviceQueryOptions(codeChallenge))
  const { mutate: publish, isPending } = useMutation(
    orpc.account.challenge.publish.mutationOptions({
      meta: { event: 'sign_in_confirmed' },
      onSuccess: () => navigate({ to: '/open', search: { type: clientType } }),
    })
  )
  const clientName = CLIENT_NAMES[clientType]

  if (!device) {
    return (
      <OpenStatus
        title="This sign-in request expired"
        description={`Start signing in again in ${clientName}.`}
      >
        <Button variant="outline" render={<Link to="/account" />}>
          Go to account
        </Button>
      </OpenStatus>
    )
  }

  return (
    <OpenStatus
      title={`Sign in to ${clientName}`}
      description={
        <>
          Continue only if you started signing in yourself. You&apos;ll be
          signed in as <span data-mask>{email}</span>.
        </>
      }
    >
      <div className="flex items-center gap-2">
        <Button variant="outline" render={<Link to="/account" />}>
          Cancel
        </Button>
        <Button disabled={isPending} onClick={() => publish({ codeChallenge })}>
          Continue
        </Button>
      </div>
    </OpenStatus>
  )
}

export const Route = createFileRoute('/deep/sign-in')({
  component: ConfirmSignIn,
  validateSearch: type({
    codeChallenge: 'string',
    type: '"web" | "desktop" | "cli" = "desktop"',
  }),
  beforeLoad: ({ context, search }) => {
    if (!context.session) {
      throw redirect({
        to: '/sign-in',
        search: {
          redirectPath: `/deep/sign-in?${new URLSearchParams(search)}`,
        },
      })
    }

    // The web app signs in with the session cookie this site just set: it never exchanges a challenge.
    if (search.type === 'web') {
      throw redirect({ to: '/open', search: { type: 'web' } })
    }

    return {
      clientType: search.type,
      email: context.session.user.email,
    }
  },
  loaderDeps: ({ search }) => ({ codeChallenge: search.codeChallenge }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query(deviceQueryOptions(deps.codeChallenge))
  },
})
