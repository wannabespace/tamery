import { GithubIcon, GoogleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SOCIAL_PROVIDER_LABELS } from '@tamery/shared/constants'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { BrowserMark, inBrowser } from './browser'
import { ConfirmAction } from './confirm-action'
import { SESSION_NOT_FRESH_CODE } from './session-not-fresh'

export const SOCIAL_PROVIDERS = [
  { icon: GoogleIcon, id: 'google', label: SOCIAL_PROVIDER_LABELS.google },
  { icon: GithubIcon, id: 'github', label: SOCIAL_PROVIDER_LABELS.github },
] as const

export const SocialRow = ({
  accountId,
  autoConnect,
  icon,
  id,
  label,
  onChange,
}: (typeof SOCIAL_PROVIDERS)[number] & {
  accountId?: string
  autoConnect: boolean
  onChange: () => void
}) => {
  const { mutate: connect, isPending: isConnecting } = useMutation({
    meta: { event: 'sign_in_method_connected' },
    mutationFn: () => {
      const url = location.origin + location.pathname

      return authClient.linkSocial({
        callbackURL: url,
        errorCallbackURL: url,
        fetchOptions: { throw: true },
        provider: id,
      })
    },
    onError: (error) => handleError(error),
  })

  useEffect(() => {
    if (autoConnect) {
      connect()
    }
  }, [autoConnect, connect])

  const { mutate: disconnect, isPending: isDisconnecting } = useMutation({
    meta: { event: 'sign_in_method_disconnected' },
    mutationFn: (idToUnlink: string) =>
      authClient.unlinkAccount({
        accountId: idToUnlink,
        fetchOptions: { throw: true },
      }),
    onError: (error: { code?: string }) => {
      if (error.code === SESSION_NOT_FRESH_CODE) {
        toast.error(`Sign in again to disconnect ${label}.`)
      } else {
        void handleError(error)
      }
    },
    onSuccess: () => {
      onChange()
      toast.success(`${label} disconnected`)
    },
  })

  return (
    <SettingsRow
      icon={<HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />}
      title={label}
      description={accountId ? 'Connected' : 'Not connected'}
    >
      {accountId ? (
        <ConfirmAction
          action="Disconnect"
          title={`Disconnect ${label}?`}
          description={`You can no longer sign in with ${label}. Email sign-in keeps working.`}
          isPending={isDisconnecting}
          onConfirm={(close) => disconnect(accountId, { onSuccess: close })}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => (inBrowser ? inBrowser(id) : connect())}
          disabled={isConnecting}
        >
          <LoadingContent loading={isConnecting}>Connect</LoadingContent>
          <BrowserMark />
        </Button>
      )}
    </SettingsRow>
  )
}
