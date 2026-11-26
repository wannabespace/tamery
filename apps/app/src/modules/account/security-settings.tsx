import { useQuery } from '@tanstack/react-query'

import { authClient } from '~/lib/auth'
import { API_QUERY_KEY } from '~/lib/query-client'

import { SignInMethods } from './sign-in-methods'
import { TwoFactor } from './two-factor'

export const SecuritySettings = () => {
  const { data: session } = authClient.useSession()
  const { data: passkeys, refetch: refetchPasskeys } = useQuery({
    queryFn: () =>
      authClient.passkey.listUserPasskeys({ fetchOptions: { throw: true } }),
    queryKey: [API_QUERY_KEY, 'auth', 'passkeys'],
  })

  if (!(session && passkeys)) {
    return null
  }

  return (
    <>
      <SignInMethods
        email={session.user.email}
        passkeys={passkeys}
        onPasskeysChange={refetchPasskeys}
      />
      <TwoFactor
        hasPasskey={passkeys.length > 0}
        twoFactorEnabled={session.user.twoFactorEnabled ?? false}
      />
    </>
  )
}
