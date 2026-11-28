import type { Passkey } from '@better-auth/passkey/client'
import { FingerPrintIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { WebAuthnErrorCode } from '@simplewebauthn/browser'
import { isPasskeyPromptDismissed } from '@tamery/shared/passkey'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { BrowserMark, inBrowser } from './browser'
import { PasskeyRow } from './passkey-row'
import { SESSION_NOT_FRESH_CODE } from './session-not-fresh'

const ALREADY_REGISTERED: WebAuthnErrorCode =
  'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'

export const Passkeys = ({
  onChange,
  passkeys,
}: {
  onChange: () => void
  passkeys: Passkey[]
}) => {
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
      onChange()
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
          onClick={() => (inBrowser ? inBrowser() : addPasskey())}
          disabled={isPending}
        >
          <LoadingContent loading={isPending}>Add</LoadingContent>
          <BrowserMark />
        </Button>
      </SettingsRow>
      {passkeys.map((passkey) => (
        <PasskeyRow key={passkey.id} {...passkey} onChange={onChange} />
      ))}
    </>
  )
}
