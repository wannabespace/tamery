import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { machine } from '~/core/runtime/machine/machine'
import { thisMachineQuery } from '~/core/runtime/machine/pairing'

import { MachineAddressDocs } from './machine-address-docs'

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
