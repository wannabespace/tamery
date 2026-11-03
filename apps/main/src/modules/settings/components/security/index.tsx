import { SmartPhone01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { useMutation } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useState } from 'react'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import type { TotpSetup } from './enable-tfa-dialog'
import { EnableTfaDialog } from './enable-tfa-dialog'
import { MoreOptions } from './more-options'

const NO_SETUP: TotpSetup = { backupCodes: [], totpURI: '' }

const { useRouteContext } = getRouteApi('/account')

export const SecuritySettings = () => {
  const { user } = useRouteContext()
  const twoFactorEnabled = user.twoFactorEnabled ?? false

  const [enableOpen, setEnableOpen] = useState(false)

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

      return result.method === 'totp' ? result : NO_SETUP
    },
    onError: handleError,
    onSuccess: () => setEnableOpen(true),
  })

  return (
    <>
      <EnableTfaDialog
        open={enableOpen}
        onOpenChange={setEnableOpen}
        setup={setup}
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
          description={
            twoFactorEnabled
              ? 'On. Signing in asks for a code from your app, or a passkey if you added one.'
              : 'Ask for a code from an authenticator app when you sign in.'
          }
        >
          {!twoFactorEnabled && (
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
        {twoFactorEnabled && <MoreOptions />}
      </SettingsGroup>
    </>
  )
}
