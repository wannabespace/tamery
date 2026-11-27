import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { machine } from '~/core/runtime/machine/machine'
import { thisMachineQuery } from '~/core/runtime/machine/pairing'
import { useHasAccount } from '~/lib/auth'

import { OnlineStatus } from './online-status'

const describeStatus = (
  status:
    | Awaited<ReturnType<NonNullable<Window['electron']>['machine']['status']>>
    | null
    | undefined
): ReactNode => {
  if (status?.turnedOff) {
    return 'Off. Your other devices cannot use this computer.'
  }
  if (status?.status === 'starting') {
    return 'Starting…'
  }
  if (status?.status === 'failed') {
    return status.message
  }
  if (status?.status === 'on') {
    return status.registerError ? (
      `Running, but not listed in your account: ${status.registerError}`
    ) : (
      <OnlineStatus>Running while Tamery is open</OnlineStatus>
    )
  }
  return 'Not running. Restart Tamery to try again.'
}

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
  const isTurningOn = turnOn.isPending && !!status?.turnedOff

  let description = describeStatus(status)
  if (!hasAccount) {
    description = 'Sign in to use this computer from your other devices.'
  } else if (error) {
    description = (
      <span className="text-destructive wrap-break-word">{error.message}</span>
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
          disabled={isTurningOn || turnOff.isPending}
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
          <LoadingContent loading={isTurningOn || turnOff.isPending}>
            {status.turnedOff ? 'Turn on' : 'Turn off'}
          </LoadingContent>
        </Button>
      )}
    </SettingsRow>
  )
}
