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
    mutationFn: machine.turnThisComputerOn,
  })
  const turnOff = useMutation({
    meta: { event: 'machine_unshared' },
    mutationFn: machine.turnThisComputerOff,
  })
  const error = turnOn.error ?? turnOff.error
  const isPending = turnOn.isPending || turnOff.isPending

  let description: ReactNode = 'Not running. Restart Tamery to try again.'
  if (!hasAccount) {
    description = 'Sign in to use this computer from your other devices.'
  } else if (error) {
    description = (
      <span className="text-destructive wrap-break-word">{error.message}</span>
    )
  } else if (status?.turnedOff) {
    description = 'Off. Your other devices cannot use this computer.'
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
      {hasAccount && status && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => {
            turnOn.reset()
            turnOff.reset()
            if (status.turnedOff) {
              turnOn.mutate()
            } else {
              turnOff.mutate()
            }
          }}
        >
          <LoadingContent loading={isPending}>
            {status.turnedOff ? 'Turn on' : 'Turn off'}
          </LoadingContent>
        </Button>
      )}
    </SettingsRow>
  )
}
