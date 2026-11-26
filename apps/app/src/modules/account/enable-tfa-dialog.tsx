import { TotpCodeInput } from '@tamery/ui/components/custom/totp-code-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tamery/ui/components/dialog'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { QRCode } from 'react-qr-code'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { queryClient } from '~/lib/query-client'
import { handleError } from '~/utils/error'

import { BackupCodes } from './backup-codes'
import { twoFactorMethodsQuery } from './two-factor-methods'

export interface TotpSetup {
  backupCodes: string[]
  // Starting setup on an account with 2FA on has already replaced its backup codes, so they must be saved before anything else can be abandoned.
  codesFirst: boolean
  totpURI: string
}

export const NO_SETUP: TotpSetup = {
  backupCodes: [],
  codesFirst: false,
  totpURI: '',
}

export const EnableTfaDialog = ({
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

      await queryClient.invalidateQueries({
        queryKey: twoFactorMethodsQuery.queryKey,
      })
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
