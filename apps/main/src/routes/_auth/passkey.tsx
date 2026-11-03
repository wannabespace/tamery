import { PASSKEY_ERROR_CODES } from '@better-auth/passkey/client'
import { FingerPrintIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { UNKNOWN_ERROR_MESSAGE } from '@tamery/shared/constants'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { useMutation } from '@tanstack/react-query'
import {
  createFileRoute,
  getRouteApi,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { type } from 'arktype'
import { toast } from 'sonner'

import { authClient, isPasskeyPromptDismissed } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { sendSignInCode, useFinishSignIn } from './-lib/sign-in'

const { useSearch } = getRouteApi('/_auth/passkey')

const PasskeyPage = () => {
  const router = useRouter()
  const search = useSearch()
  const finishSignIn = useFinishSignIn()

  const { mutate: signIn, isPending: isSigningIn } = useMutation({
    meta: { event: 'passkey_signed_in' },
    mutationFn: async () => {
      const { error } = await authClient.signIn.passkey()

      if (error) {
        throw error
      }
    },
    onSuccess: () => finishSignIn(),
    // Not handleError: it reads a 401 as an expired session, and a passkey the account no longer has answers 401.
    onError: (error: { code?: string; message?: string }) => {
      if (error.code === PASSKEY_ERROR_CODES.PASSKEY_NOT_FOUND.code) {
        toast.error(
          "That passkey isn't on your account anymore. Delete it from your password manager."
        )
      } else if (!isPasskeyPromptDismissed(error)) {
        toast.error(error.message ?? UNKNOWN_ERROR_MESSAGE)
      }
    },
  })

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
      <Button
        className="w-full"
        onClick={() => signIn()}
        disabled={isSigningIn}
        autoFocus
      >
        <LoadingContent loading={isSigningIn}>
          <HugeiconsIcon
            icon={FingerPrintIcon}
            strokeWidth={2}
            className="size-4"
          />
          Continue with passkey
        </LoadingContent>
      </Button>
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
