import { PASSKEY_ERROR_CODES } from '@better-auth/passkey/client'
import { FingerPrintIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { UNKNOWN_ERROR_MESSAGE } from '@tamery/shared/constants'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { useMutation } from '@tanstack/react-query'
import type { ComponentProps } from 'react'
import { toast } from 'sonner'

import { authClient, isPasskeyPromptDismissed } from '~/lib/auth'

import { useFinishSignIn } from '../-lib/sign-in'

export const PasskeyButton = (
  props: Pick<ComponentProps<typeof Button>, 'autoFocus' | 'variant'>
) => {
  const finishSignIn = useFinishSignIn()

  const { mutate: signIn, isPending } = useMutation({
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

  return (
    <Button
      className="w-full"
      onClick={() => signIn()}
      disabled={isPending}
      {...props}
    >
      <LoadingContent loading={isPending}>
        <HugeiconsIcon
          icon={FingerPrintIcon}
          strokeWidth={2}
          className="size-4"
        />
        Continue with passkey
      </LoadingContent>
    </Button>
  )
}
