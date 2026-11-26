import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { machine } from '~/core/runtime/machine/machine'
import { thisMachineQuery } from '~/core/runtime/machine/pairing'
import { useHasAccount } from '~/lib/auth'

import { OnlineStatus } from './online-status'

/** Desktop only: this computer's row among the account's machines. */
export const ThisComputerRow = ({ name }: { name: string | null }) => {
  const { data: status } = useQuery(thisMachineQuery)
  const hasAccount = useHasAccount()
  const turnOn = useMutation({
    meta: { event: 'machine_shared' },
    mutationFn: () => machine.startThisComputer(status?.publicUrl ?? null),
  })
  const isTurnedOff = hasAccount && status?.enabled === false && !!status.id

  let description: ReactNode = 'Not running. Restart Tamery to try again.'
  if (!hasAccount) {
    description = 'Sign in to use this computer from your other devices.'
  } else if (isTurnedOff) {
    description =
      'Turned off. Turn it on to use this computer from your other devices.'
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
    >
      {isTurnedOff && (
        <Button
          variant="outline"
          size="sm"
          disabled={turnOn.isPending}
          onClick={() => turnOn.mutate()}
        >
          <LoadingContent loading={turnOn.isPending}>Turn on</LoadingContent>
        </Button>
      )}
    </SettingsRow>
  )
}
