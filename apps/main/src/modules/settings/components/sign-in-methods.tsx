import { GithubIcon, GoogleIcon, Mail01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SOCIAL_PROVIDER_LABELS } from '@tamery/shared/constants'
import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import {
  queryOptions,
  useMutation,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { authClient, SESSION_NOT_FRESH_CODE } from '~/lib/auth'
import { handleError } from '~/utils/error'

import { ConfirmAction } from './confirm-action'
import { PasskeysSettings } from './passkeys'

const { useNavigate, useSearch } = getRouteApi('/account/authentication')
const { useRouteContext } = getRouteApi('/account')

export const accountsQueryOptions = queryOptions({
  queryFn: () => authClient.listAccounts({ fetchOptions: { throw: true } }),
  queryKey: ['accounts'],
})

const SOCIAL_PROVIDERS = [
  { icon: GoogleIcon, id: 'google', label: SOCIAL_PROVIDER_LABELS.google },
  { icon: GithubIcon, id: 'github', label: SOCIAL_PROVIDER_LABELS.github },
]

const SocialRow = ({
  accountId,
  icon,
  id,
  label,
  refetchAccounts,
}: (typeof SOCIAL_PROVIDERS)[number] & {
  accountId?: string
  refetchAccounts: () => void
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
    onError: handleError,
  })

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
      refetchAccounts()
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
          onClick={() => connect()}
          disabled={isConnecting}
        >
          <LoadingContent loading={isConnecting}>Connect</LoadingContent>
        </Button>
      )}
    </SettingsRow>
  )
}

export const SignInMethods = () => {
  const { user } = useRouteContext()
  const { error } = useSearch()
  const navigate = useNavigate()
  const { data: accounts, refetch: refetchAccounts } =
    useSuspenseQuery(accountsQueryOptions)

  useEffect(() => {
    if (error) {
      toast.error(
        "Couldn't connect that account. It must use your Tamery email and not belong to another Tamery account."
      )
      void navigate({ replace: true, search: {} })
    }
  }, [error, navigate])

  return (
    <SettingsGroup title="Sign-in methods">
      <SettingsRow
        icon={
          <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} className="size-4" />
        }
        title="Email"
        description={<span data-mask>{user.email}</span>}
      />
      <PasskeysSettings />
      {SOCIAL_PROVIDERS.map((provider) => (
        <SocialRow
          key={provider.id}
          {...provider}
          accountId={
            accounts.find(({ providerId }) => providerId === provider.id)?.id
          }
          refetchAccounts={refetchAccounts}
        />
      ))}
    </SettingsGroup>
  )
}
