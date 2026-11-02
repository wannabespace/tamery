import { challenge } from '@tamery/shared/challenge'
import { Button } from '@tamery/ui/components/button'
import { useMutation } from '@tanstack/react-query'
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
  web: 'Tamery',
}

const ConfirmSignIn = () => {
  const { codeChallenge, newUser, type: clientType } = useSearch()
  const { email } = useRouteContext()
  const navigate = useNavigate()
  const { mutate: publish, isPending } = useMutation(
    orpc.account.challenge.publish.mutationOptions({
      meta: { event: 'sign_in_confirmed' },
      onSuccess: () => navigate({ to: '/open', search: { type: clientType } }),
    })
  )

  return (
    <OpenStatus
      title={`Sign in to ${CLIENT_NAMES[clientType]}`}
      description={`Continue only if ${clientType === 'cli' ? `your terminal shows ${challenge.getUserCode(codeChallenge)}` : 'you started signing in yourself'}. You'll be signed in as ${email}.`}
    >
      <div className="flex items-center gap-2">
        <Button variant="outline" render={<Link to="/account" />}>
          Cancel
        </Button>
        <Button
          disabled={isPending}
          onClick={() => publish({ codeChallenge, newUser })}
        >
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
    'newUser?': 'boolean',
    type: '"web" | "desktop" | "cli" = "desktop"',
  }),
  beforeLoad: ({ context, search }) => {
    if (!context.session) {
      throw redirect({
        to: '/sign-in',
        search: {
          redirectPath: `/deep/sign-in?codeChallenge=${search.codeChallenge}&type=${search.type}`,
        },
      })
    }

    return { email: context.session.user.email }
  },
})
