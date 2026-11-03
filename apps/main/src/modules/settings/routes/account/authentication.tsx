import { createFileRoute } from '@tanstack/react-router'
import { type } from 'arktype'

import { AccountPage } from '~/components/account-page'

import { passkeysQueryOptions } from '../../components/passkeys'
import { SecuritySettings } from '../../components/security'
import {
  accountsQueryOptions,
  SignInMethods,
} from '../../components/sign-in-methods'

const AuthenticationPage = () => (
  <AccountPage title="Authentication">
    <SignInMethods />
    <SecuritySettings />
  </AccountPage>
)

export const Route = createFileRoute('/account/authentication')({
  component: AuthenticationPage,
  validateSearch: type({
    'error?': 'string',
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({
        ...accountsQueryOptions,
        staleTime: 'static',
      }),
      context.queryClient.query({
        ...passkeysQueryOptions,
        staleTime: 'static',
      }),
    ])
  },
})
