import { createFileRoute } from '@tanstack/react-router'

import { AccountPage } from '~/components/account-page'
import { orpc } from '~/lib/orpc'

import { DeleteAccountSettings } from '../../../components/delete-account'
import {
  PasskeysSettings,
  passkeysQueryOptions,
} from '../../../components/passkeys'
import { SecuritySettings } from '../../../components/security'
import { SessionsSettings } from '../../../components/sessions'

const SettingsPage = () => (
  <AccountPage title="Settings">
    <SecuritySettings />
    <PasskeysSettings />
    <SessionsSettings />
    <DeleteAccountSettings />
  </AccountPage>
)

export const Route = createFileRoute('/account/settings/')({
  component: SettingsPage,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({
        ...orpc.account.sessions.queryOptions(),
        staleTime: 'static',
      }),
      context.queryClient.query({
        ...passkeysQueryOptions,
        staleTime: 'static',
      }),
    ])
  },
})
