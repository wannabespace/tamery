import { FingerPrintIcon, SmartPhone01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { passkeysQueryOptions } from '../passkeys'
import type { TotpSetup } from './enable-tfa-dialog'
import { BackupCodesDialog, EnableTfaDialog } from './enable-tfa-dialog'
import { MoreOptions } from './more-options'
import {
  twoFactorMethodsQueryOptions,
  useReloadTwoFactor,
} from './two-factor-methods'

const NO_SETUP: TotpSetup = { backupCodes: [], codesFirst: false, totpURI: '' }

const { useRouteContext } = getRouteApi('/account')

const getAuthenticatorDescription = ({
  hasAuthenticator,
  twoFactorEnabled,
}: {
  hasAuthenticator: boolean
  twoFactorEnabled: boolean
}) => {
  if (!twoFactorEnabled) {
    return 'Ask for a code from an authenticator app when you sign in.'
  }

  return hasAuthenticator
    ? 'On. Signing in accepts a code from your app.'
    : 'Also accept a code from an authenticator app when you sign in.'
}

const getPasskeyDescription = ({
  hasPasskey,
  twoFactorEnabled,
}: {
  hasPasskey: boolean
  twoFactorEnabled: boolean
}) => {
  if (!hasPasskey) {
    return 'Add a passkey above to use it as a second factor.'
  }

  return twoFactorEnabled
    ? 'On. Signing in accepts your passkey.'
    : 'Ask for your passkey after an email code, Google or GitHub.'
}

export const SecuritySettings = () => {
  const { user } = useRouteContext()
  const twoFactorEnabled = user.twoFactorEnabled ?? false
  const { data: passkeys } = useSuspenseQuery(passkeysQueryOptions)
  const {
    data: { hasAuthenticator },
  } = useSuspenseQuery(twoFactorMethodsQueryOptions)
  const reloadTwoFactor = useReloadTwoFactor()
  const hasPasskey = passkeys.length > 0

  const [enableOpen, setEnableOpen] = useState(false)
  const [passkeyCodesOpen, setPasskeyCodesOpen] = useState(false)

  const {
    mutate: enable,
    isPending: isEnabling,
    data: setup = NO_SETUP,
  } = useMutation({
    meta: { event: 'two_factor_setup_started' },
    mutationFn: async () => {
      const result = await authClient.twoFactor.enable({
        fetchOptions: { throw: true },
      })

      return result.method === 'totp'
        ? { ...result, codesFirst: twoFactorEnabled }
        : NO_SETUP
    },
    onError: handleError,
    onSuccess: () => setEnableOpen(true),
  })

  const {
    mutate: enableWithPasskey,
    isPending: isEnablingWithPasskey,
    data: passkeyCodes = [],
  } = useMutation({
    meta: { event: 'two_factor_enabled_with_passkey' },
    mutationFn: async () => {
      const result = await authClient.twoFactor.enable({
        fetchOptions: { throw: true },
      })

      await authClient.$fetch('/two-factor/enable-with-passkey', {
        body: {},
        method: 'POST',
        throw: true,
      })

      return result.method === 'totp' ? result.backupCodes : []
    },
    onError: handleError,
    onSuccess: async () => {
      toast.success('2FA enabled')
      setPasskeyCodesOpen(true)
      await reloadTwoFactor()
    },
  })

  return (
    <>
      <EnableTfaDialog
        open={enableOpen}
        onOpenChange={setEnableOpen}
        setup={setup}
      />
      <BackupCodesDialog
        codes={passkeyCodes}
        open={passkeyCodesOpen}
        onOpenChange={setPasskeyCodesOpen}
      />
      <SettingsGroup title="Two-factor authentication">
        <SettingsRow
          icon={
            <HugeiconsIcon
              icon={SmartPhone01Icon}
              strokeWidth={2}
              className="size-4"
            />
          }
          title="Authenticator app"
          description={getAuthenticatorDescription({
            hasAuthenticator,
            twoFactorEnabled,
          })}
        >
          {!(twoFactorEnabled && hasAuthenticator) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => enable()}
              disabled={isEnabling}
            >
              <LoadingContent loading={isEnabling}>Set up</LoadingContent>
            </Button>
          )}
        </SettingsRow>
        <SettingsRow
          icon={
            <HugeiconsIcon
              icon={FingerPrintIcon}
              strokeWidth={2}
              className="size-4"
            />
          }
          title="Passkey"
          description={getPasskeyDescription({ hasPasskey, twoFactorEnabled })}
        >
          {hasPasskey && !twoFactorEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => enableWithPasskey()}
              disabled={isEnablingWithPasskey}
            >
              <LoadingContent loading={isEnablingWithPasskey}>
                Turn on
              </LoadingContent>
            </Button>
          )}
        </SettingsRow>
        {twoFactorEnabled && <MoreOptions />}
      </SettingsGroup>
    </>
  )
}
