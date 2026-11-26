import {
  ArrowDown01Icon,
  FingerPrintIcon,
  SecurityBlockIcon,
  Shield01Icon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { downloadFile } from '@tamery/shared/files'
import { Button } from '@tamery/ui/components/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tamery/ui/components/collapsible'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { TotpCodeInput } from '@tamery/ui/components/custom/totp-code-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { Item, ItemMedia } from '@tamery/ui/components/item'
import { copy } from '@tamery/ui/lib/copy'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { QRCode } from 'react-qr-code'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { posthog } from '~/lib/posthog'
import { API_QUERY_KEY, queryClient } from '~/lib/query-client'
import { handleError } from '~/utils/error'

import { ConfirmAction } from './confirm-action'

const twoFactorMethodsQuery = {
  queryFn: async () => {
    const { data, error } = await authClient.$fetch<{
      hasAuthenticator: boolean
      hasPasskey: boolean
    }>('/passkey/two-factor-methods', { method: 'GET' })

    if (error) {
      throw error
    }

    return data
  },
  queryKey: [API_QUERY_KEY, 'auth', 'two-factor-methods'],
}

const refetchTwoFactorMethods = () =>
  queryClient.invalidateQueries({ queryKey: twoFactorMethodsQuery.queryKey })

const BackupCodes = ({
  codes,
  onDone,
}: {
  codes: string[]
  onDone: () => void
}) => (
  <>
    <DialogHeader>
      <DialogTitle>Save your backup codes</DialogTitle>
      <DialogDescription>
        Each code signs you in once if you lose your authenticator app. They
        won&apos;t be shown again.
      </DialogDescription>
    </DialogHeader>
    <div data-mask className="grid grid-cols-2 gap-2 font-mono text-sm">
      {codes.map((code) => (
        <span key={code}>{code}</span>
      ))}
    </div>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => copy(codes.join('\n'), 'Backup codes copied')}
      >
        Copy
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          downloadFile(
            codes.join('\n'),
            'tamery-backup-codes.txt',
            'text/plain'
          )
          posthog.capture('backup_codes_downloaded')
        }}
      >
        Download
      </Button>
      <Button onClick={onDone}>Done</Button>
    </DialogFooter>
  </>
)

const BackupCodesDialog = ({
  codes,
  onOpenChange,
  open,
}: {
  codes: string[]
  onOpenChange: (open: boolean) => void
  open: boolean
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xs">
      <BackupCodes codes={codes} onDone={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
)

interface TotpSetup {
  backupCodes: string[]
  // Starting setup on an account with 2FA on has already replaced its backup codes, so they must be saved before anything else can be abandoned.
  codesFirst: boolean
  totpURI: string
}

const NO_SETUP: TotpSetup = { backupCodes: [], codesFirst: false, totpURI: '' }

const EnableTfaDialog = ({
  onOpenChange,
  open,
  setup,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  setup: TotpSetup
}) => {
  const [code, setCode] = useState('')
  const [isVerified, setIsVerified] = useState(false)
  const [codesSaved, setCodesSaved] = useState(false)

  const { mutate: verifyTotp, isPending } = useMutation({
    meta: {
      event: setup.codesFirst ? 'authenticator_added' : 'two_factor_enabled',
    },
    mutationFn: (codeValue: string) =>
      authClient.twoFactor.verifyTotp({
        code: codeValue,
        fetchOptions: { throw: true },
        trustDevice: true,
      }),
    onError: (error) => {
      void handleError(error)
      setCode('')
    },
    onSuccess: async () => {
      if (setup.codesFirst) {
        toast.success('Authenticator app added')
        onOpenChange(false)
      } else {
        toast.success('2FA enabled')
        setIsVerified(true)
      }

      await refetchTwoFactorMethods()
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          setCode('')
          setIsVerified(false)
          setCodesSaved(false)
        }
      }}
    >
      <DialogContent className="sm:max-w-xs">
        {(setup.codesFirst ? !codesSaved : isVerified) ? (
          <BackupCodes
            codes={setup.backupCodes}
            onDone={() =>
              setup.codesFirst ? setCodesSaved(true) : onOpenChange(false)
            }
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Scan QR Code</DialogTitle>
              <DialogDescription>
                Scan this QR Code with your authenticator app, then enter the
                code it shows.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-lg bg-white p-4">
                <QRCode value={setup.totpURI} size={176} />
              </div>
              <TotpCodeInput
                aria-label="Verification code"
                value={code}
                onChange={setCode}
                onComplete={verifyTotp}
                loading={isPending}
                autoFocus
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

const MoreOptions = () => {
  const [codesOpen, setCodesOpen] = useState(false)

  const {
    mutate: regenerate,
    isPending: isRegenerating,
    data: regenerated,
  } = useMutation({
    meta: { event: 'backup_codes_regenerated' },
    mutationFn: () =>
      authClient.twoFactor.generateBackupCodes({
        fetchOptions: { throw: true },
      }),
    onError: (error) => handleError(error),
    onSuccess: () => setCodesOpen(true),
  })

  const { mutate: disable, isPending: isDisabling } = useMutation({
    meta: { event: 'two_factor_disabled' },
    mutationFn: () =>
      authClient.twoFactor.disable({ fetchOptions: { throw: true } }),
    onError: (error) => handleError(error),
    onSuccess: async () => {
      toast.success('2FA disabled')
      await refetchTwoFactorMethods()
    },
  })

  return (
    <Collapsible>
      <BackupCodesDialog
        codes={regenerated?.backupCodes ?? []}
        open={codesOpen}
        onOpenChange={setCodesOpen}
      />
      <Item
        size="sm"
        variant="grouped"
        render={<CollapsibleTrigger variant="disclosure" />}
      >
        <ItemMedia>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="size-4 transition-transform duration-100 group-data-panel-open/item:rotate-180"
          />
        </ItemMedia>
        More options
      </Item>
      <CollapsibleContent className="ease-house h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 data-ending-style:h-0 data-starting-style:h-0">
        <SettingsRow
          icon={
            <HugeiconsIcon
              icon={Shield01Icon}
              strokeWidth={2}
              className="size-4"
            />
          }
          title="Backup codes"
          description="Single-use codes in case you lose your authenticator app."
        >
          <ConfirmAction
            action="Regenerate"
            title="Regenerate backup codes?"
            description="Your current backup codes stop working."
            isPending={isRegenerating}
            onConfirm={(close) => regenerate(undefined, { onSuccess: close })}
          />
        </SettingsRow>
        <SettingsRow
          icon={
            <HugeiconsIcon
              icon={SecurityBlockIcon}
              strokeWidth={2}
              className="size-4"
            />
          }
          title="Disable two-factor authentication"
          description="Stops asking for a second factor at sign-in. Your backup codes stop working."
        >
          <ConfirmAction
            action="Disable"
            title="Disable two-factor authentication?"
            description="Sign-in will no longer ask for a second factor, and your backup codes stop working."
            isPending={isDisabling}
            onConfirm={(close) => disable(undefined, { onSuccess: close })}
          />
        </SettingsRow>
      </CollapsibleContent>
    </Collapsible>
  )
}

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

export const TwoFactor = ({
  hasPasskey,
  twoFactorEnabled,
}: {
  hasPasskey: boolean
  twoFactorEnabled: boolean
}) => {
  const { data: methods } = useQuery(twoFactorMethodsQuery)
  const hasAuthenticator = methods?.hasAuthenticator ?? false
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
    onError: (error) => handleError(error),
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
    onError: (error) => handleError(error),
    onSuccess: async () => {
      toast.success('2FA enabled')
      setPasskeyCodesOpen(true)
      await refetchTwoFactorMethods()
    },
  })

  if (!methods) {
    return null
  }

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
