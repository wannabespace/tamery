import { Button } from '@tamery/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import {
  createFileRoute,
  getRouteApi,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { type } from 'arktype'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { PasskeyButton } from './-components/passkey-button'
import { sendSignInCode } from './-lib/sign-in'

const { useSearch } = getRouteApi('/_auth/passkey')

const PasskeyPage = () => {
  const router = useRouter()
  const search = useSearch()

  const { mutate: sendCode, isPending: isSendingCode } = useMutation({
    meta: { event: 'sign_in_code_sent' },
    mutationFn: () => sendSignInCode(search.email),
    onSuccess: () => router.navigate({ to: '/email-code', search }),
    onError: handleError,
  })

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Use your passkey
        </h1>
        <p className="text-muted-foreground text-sm">
          Sign in as{' '}
          <span data-mask className="text-foreground">
            {search.email}
          </span>
        </p>
      </div>
      <PasskeyButton autoFocus />
      <div className="flex gap-4">
        <Button
          variant="link-muted"
          size="xs"
          render={
            <Link
              to="/sign-in"
              search={{ redirectPath: search.redirectPath }}
            />
          }
        >
          Use a different email
        </Button>
        <Button
          variant="link-muted"
          size="xs"
          onClick={() => sendCode()}
          disabled={isSendingCode}
        >
          Email me a code instead
        </Button>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_auth/passkey')({
  component: PasskeyPage,
  validateSearch: type({
    email: 'string.email',
  }),
  loader: async () => {
    const { data } = await authClient.getSession()

    if (data?.user) {
      throw redirect({ to: '/account' })
    }
  },
})
