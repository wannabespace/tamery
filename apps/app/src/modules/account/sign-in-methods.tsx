import type { Passkey } from '@better-auth/passkey/client'
import { Mail01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { API_QUERY_KEY } from '~/lib/query-client'

import { Passkeys } from './passkeys'
import { SOCIAL_PROVIDERS, SocialRow } from './social-row'

const { useNavigate, useSearch } = getRouteApi('/_protected/settings/$section')

export const SignInMethods = ({
  email,
  onPasskeysChange,
  passkeys,
}: {
  email: string
  onPasskeysChange: () => void
  passkeys: Passkey[]
}) => {
  const { connect, error } = useSearch()
  const navigate = useNavigate()
  const { data: accounts, refetch } = useQuery({
    queryFn: () => authClient.listAccounts({ fetchOptions: { throw: true } }),
    queryKey: [API_QUERY_KEY, 'auth', 'accounts'],
  })

  useEffect(() => {
    if (connect && accounts) {
      void navigate({ replace: true, search: {} })
    }
  }, [accounts, connect, navigate])

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
        description={<span data-mask>{email}</span>}
      />
      <Passkeys passkeys={passkeys} onChange={onPasskeysChange} />
      {SOCIAL_PROVIDERS.map((provider) => (
        <SocialRow
          key={provider.id}
          {...provider}
          accountId={
            accounts?.find(({ providerId }) => providerId === provider.id)?.id
          }
          autoConnect={
            connect === provider.id &&
            !!accounts?.every(({ providerId }) => providerId !== provider.id)
          }
          onChange={refetch}
        />
      ))}
    </SettingsGroup>
  )
}
