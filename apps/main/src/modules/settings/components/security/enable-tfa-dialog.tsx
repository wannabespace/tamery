import { downloadFile } from '@tamery/shared/files'
import { Button } from '@tamery/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { copy } from '@tamery/ui/lib/copy'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { QRCode } from 'react-qr-code'
import { toast } from 'sonner'

import { TotpCodeInput } from '~/components/totp-code-input'
import { authClient } from '~/lib/auth'
import { posthog } from '~/lib/posthog'
import { handleError } from '~/utils/error'

import { useReloadTwoFactor } from './two-factor-methods'

export interface TotpSetup {
  backupCodes: string[]
  // Starting setup on an account with 2FA on has already replaced its backup codes, so they must be saved before anything else can be abandoned.
  codesFirst: boolean
  totpURI: string
}

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
          void posthog.capture('backup_codes_downloaded')
        }}
      >
        Download
      </Button>
      <Button onClick={onDone}>Done</Button>
    </DialogFooter>
  </>
)

export const BackupCodesDialog = ({
  codes,
  open,
  onOpenChange,
}: {
  codes: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xs">
      <BackupCodes codes={codes} onDone={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
)

export const EnableTfaDialog = ({
  open,
  onOpenChange,
  setup,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  setup: TotpSetup
}) => {
  const reloadTwoFactor = useReloadTwoFactor()
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
    onError: (e) => {
      handleError(e)
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

      await reloadTwoFactor()
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
