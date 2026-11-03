import { createFileRoute } from '@tanstack/react-router'

import { AccountPage } from '~/components/account-page'
import { orpc } from '~/lib/orpc'

import { DeleteAccountSettings } from '../../../components/delete-account'
import { SessionsSettings } from '../../../components/sessions'

const SettingsPage = () => (
  <AccountPage title="Settings">
    <SessionsSettings />
    <DeleteAccountSettings />
  </AccountPage>
)

export const Route = createFileRoute('/account/settings/')({
  component: SettingsPage,
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...orpc.account.sessions.queryOptions(),
      staleTime: 'static',
    })
  },
})
