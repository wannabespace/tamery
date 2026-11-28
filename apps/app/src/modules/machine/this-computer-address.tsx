import { Button } from '@tamery/ui/components/button'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { machine } from '~/core/runtime/machine/machine'
import { thisMachineQuery } from '~/core/runtime/machine/pairing'
import { bearerToken } from '~/lib/auth'

import { MachineAddressDocs } from './machine-address-docs'

/**
 * Desktop only: where other computers reach this one; browsers here need none. Each status main sends, sign-out
 * included, and each save drop the draft, so the field shows main's address whenever it is not being edited. A draft
 * keeps the session that started it, and saves only while that session is the signed-in one.
 */
export const ThisComputerAddress = () => {
  const { data: status } = useQuery(thisMachineQuery)
  const [draft, setDraft] = useState<{
    text: string
    token: string | null
  } | null>(null)
  const [shown, setShown] = useState(status)
  const { error, isPending, mutate } = useMutation({
    meta: { event: 'machine_address_saved' },
    mutationFn: ({ text, token }: { text: string; token: string | null }) =>
      machine.saveThisComputerAddress({
        draftToken: token,
        publicUrl: text.trim() || null,
      }),
  })

  if (status !== shown) {
    setShown(status)
    setDraft(null)
  }

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
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (draft !== null) {
            mutate(draft)
            setDraft(null)
          }
        }}
      >
        <Input
          data-mask
          aria-label="Address for your other computers"
          className="w-56"
          placeholder="https://mac.example.com"
          value={draft?.text ?? saved}
          onChange={(event) =>
            setDraft({
              text: event.target.value,
              token: draft ? draft.token : bearerToken.get(),
            })
          }
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={isPending || draft === null || draft.text.trim() === saved}
        >
          <LoadingContent loading={isPending}>Save</LoadingContent>
        </Button>
      </form>
    </SettingsRow>
  )
}
