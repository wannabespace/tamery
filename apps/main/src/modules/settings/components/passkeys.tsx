import { FingerPrintIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { WebAuthnErrorCode } from '@simplewebauthn/browser'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import {
  queryOptions,
  useMutation,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  authClient,
  isPasskeyPromptDismissed,
  SESSION_NOT_FRESH_CODE,
} from '~/lib/auth'
import { handleError } from '~/utils/error'

import { PasskeyItem } from './passkey-item'

const ALREADY_REGISTERED: WebAuthnErrorCode =
  'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'

export const passkeysQueryOptions = queryOptions({
  queryFn: () =>
    authClient.passkey.listUserPasskeys({ fetchOptions: { throw: true } }),
  queryKey: ['passkeys'],
})

export const PasskeysSettings = () => {
  const { data: passkeys, refetch: refetchPasskeys } =
    useSuspenseQuery(passkeysQueryOptions)

  const { mutate: addPasskey, isPending } = useMutation({
    meta: { event: 'passkey_added' },
    mutationFn: async () => {
      const { error } = await authClient.passkey.addPasskey()

      if (error) {
        throw error
      }
    },
    onError: (error: { code?: string }) => {
      if (error.code === SESSION_NOT_FRESH_CODE) {
        toast.error('Sign in again to add a passkey.')
      } else if (error.code === ALREADY_REGISTERED) {
        toast.error(
          'This device or password manager already has a passkey for your account.'
        )
      } else if (!isPasskeyPromptDismissed(error)) {
        void handleError(error)
      }
    },
    onSuccess: () => {
      refetchPasskeys()
      toast.success('Passkey added')
    },
  })

  return (
    <>
      <SettingsRow
        icon={
          <HugeiconsIcon
            icon={FingerPrintIcon}
            strokeWidth={2}
            className="size-4"
          />
        }
        title="Passkeys"
        description={
          passkeys.length > 0
            ? `${passkeys.length} registered`
            : 'Sign in with your fingerprint, face or device PIN instead of an email code.'
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => addPasskey()}
          disabled={isPending}
        >
          <LoadingContent loading={isPending}>Add</LoadingContent>
        </Button>
      </SettingsRow>
      {passkeys.map((passkey) => (
        <PasskeyItem
          key={passkey.id}
          {...passkey}
          refetchPasskeys={refetchPasskeys}
        />
      ))}
    </>
  )
}
