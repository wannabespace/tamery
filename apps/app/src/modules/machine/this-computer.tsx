import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { machine } from '~/core/runtime/machine/machine'
import { thisMachineQuery } from '~/core/runtime/machine/pairing'
import { useHasAccount } from '~/lib/auth'

import { MachineAddressDocs } from './machine-address-docs'
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

/** Desktop only: where other computers reach this one; browsers here need none. */
export const ThisComputerAddress = () => {
  const { data: status } = useQuery(thisMachineQuery)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const { error, mutate } = useMutation({
    meta: { event: 'machine_address_saved' },
    mutationFn: (address: string) =>
      machine.startThisComputer(address.trim() || null),
  })

  if (status?.status !== 'on' && !status?.publicUrl) {
    return null
  }

  const saved = status.publicUrl ?? ''

  return (
    <SettingsRow
      title={
        <span>
          Address for your other computers
          <span className="text-muted-foreground"> Optional</span>
        </span>
      }
      description={
        error ? (
          <span className="text-destructive wrap-break-word">
            {error.message}
          </span>
        ) : (
          <>
            To run queries here from another computer, paste an address that
            reaches this one. <MachineAddressDocs />
          </>
        )
      }
    >
      <Input
        data-mask
        aria-label="Address for your other computers"
        className="w-56"
        placeholder="https://mac.example.com"
        value={publicUrl ?? saved}
        onChange={(event) => setPublicUrl(event.target.value)}
        onBlur={() => {
          if (publicUrl !== null && publicUrl.trim() !== saved) {
            mutate(publicUrl)
          }
        }}
      />
    </SettingsRow>
  )
}
