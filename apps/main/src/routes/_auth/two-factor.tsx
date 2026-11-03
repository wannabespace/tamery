import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { Field, FieldLabel } from '@tamery/ui/components/field'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, redirect } from '@tanstack/react-router'
import { useState } from 'react'

import { TotpCodeInput } from '~/components/totp-code-input'
import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { PasskeyButton } from './-components/passkey-button'
import { useFinishSignIn } from './-lib/sign-in'

const { useLoaderData } = getRouteApi('/_auth/two-factor')

const TwoFactorPage = () => {
  const { hasPasskey } = useLoaderData()
  const appCodeHint = hasPasskey
    ? 'Enter the code from your authenticator app or continue with a passkey.'
    : 'Enter the code from your authenticator app.'
  const finishSignIn = useFinishSignIn()
  const [code, setCode] = useState('')
  const [isBackupCode, setIsBackupCode] = useState(false)

  const { mutate: verify, isPending } = useMutation({
    meta: { event: 'two_factor_verified' },
    mutationFn: async (value: string) => {
      const { error } = isBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code: value })
        : await authClient.twoFactor.verifyTotp({ code: value })

      if (error) {
        throw error
      }
    },
    onSuccess: () => finishSignIn(),
    onError: (error) => {
      setCode('')
      handleError(error)
    },
  })

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Two-factor authentication
        </h1>
        <p className="text-muted-foreground text-sm">
          {isBackupCode
            ? 'Enter one of the backup codes you saved when you turned on 2FA.'
            : appCodeHint}
        </p>
      </div>
      {isBackupCode ? (
        <form
          className="flex w-full flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            verify(code.trim())
          }}
        >
          <Field>
            <FieldLabel htmlFor="backup-code">Backup code</FieldLabel>
            <Input
              id="backup-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="xxxxx-xxxxx"
              autoComplete="one-time-code"
              spellCheck={false}
              disabled={isPending}
              autoFocus
            />
          </Field>
          <Button
            className="w-full"
            type="submit"
            disabled={isPending || !code}
          >
            <LoadingContent loading={isPending}>Verify</LoadingContent>
          </Button>
        </form>
      ) : (
        <TotpCodeInput
          label="Verification code"
          value={code}
          onChange={setCode}
          onComplete={verify}
          loading={isPending}
          autoFocus
        />
      )}
      {hasPasskey && <PasskeyButton variant="outline" />}
      <Button
        variant="link-muted"
        size="xs"
        onClick={() => {
          setCode('')
          setIsBackupCode(!isBackupCode)
        }}
      >
        {isBackupCode ? 'Use your authenticator app' : 'Use a backup code'}
      </Button>
    </div>
  )
}

export const Route = createFileRoute('/_auth/two-factor')({
  component: TwoFactorPage,
  loader: async () => {
    const { data: session } = await authClient.getSession()

    if (session?.user) {
      throw redirect({ to: '/account' })
    }

    const { data } = await authClient.$fetch<{ hasPasskey: boolean }>(
      '/passkey/pending-two-factor',
      { method: 'GET' }
    )

    return { hasPasskey: data?.hasPasskey ?? false }
  },
})
