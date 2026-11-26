import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { thisMachineQuery } from '~/core/runtime/machine/pairing'
import { useHasAccount } from '~/lib/auth'

import { OnlineStatus } from './online-status'

/** Desktop only: this computer's row among the account's machines. */
export const ThisComputerRow = ({ name }: { name: string | null }) => {
  const { data: status } = useQuery(thisMachineQuery)
  const hasAccount = useHasAccount()

  let description: ReactNode = 'Not running. Restart Tamery to try again.'
  if (!hasAccount) {
    description = 'Sign in to use this computer from your other devices.'
  } else if (status?.status === 'starting') {
    description = 'Starting…'
  } else if (status?.status === 'failed') {
    description = status.message
  } else if (status?.status === 'on') {
    description = status.registerError ? (
      `Running, but not listed in your account: ${status.registerError}`
    ) : (
      <OnlineStatus>Running while Tamery is open</OnlineStatus>
    )
  }

  return (
    <SettingsRow
      title={
        <span>
          This computer
          {name && (
            <span data-mask className="text-muted-foreground">
              {' '}
              {name}
            </span>
          )}
        </span>
      }
      description={description}
    />
  )
}
