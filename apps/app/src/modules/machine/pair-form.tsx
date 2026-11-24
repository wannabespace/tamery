import { challenge } from '@tamery/shared/challenge'
import { MACHINE_URL, machineKey } from '@tamery/shared/machine'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
import { InlineCode } from '@tamery/ui/components/custom/inline-code'
import { LoadingContent } from '@tamery/ui/components/custom/loading-content'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { getCollections } from '~/core/collections'
import { FetchingReason } from '~/core/connection/fetching-reason'
import { parseMachineUrl } from '~/core/runtime/machine/client'
import { machine } from '~/core/runtime/machine/machine'

export const PairForm = ({ link }: { link: string | null }) => {
  const [url, setUrl] = useState(link ?? '')
  const target = url.trim() || MACHINE_URL
  const origin = parseMachineUrl(target)
  const { error, isPending, mutate, variables } = useMutation({
    meta: { event: 'machine_paired' },
    mutationFn: (browserNonce: string) =>
      machine.pair({ browserNonce, machineId: null, urls: [target] }),
    onSuccess: (pairing) =>
      getCollections().machinesCollection.has(pairing.machineId)
        ? toast.success('Machine connected')
        : toast.warning(
            'Connected, but your account doesn’t list this machine, so no connection runs on it. Check that it is signed in to this account.'
          ),
  })

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        mutate(machineKey.nonce())
      }}
    >
      <SettingsGroup title="Connect by URL">
        <SettingsRow
          title="Machine URL"
          description={
            origin ? (
              <>
                Queries run on the computer at{' '}
                <span data-mask className="font-mono">
                  {origin}
                </span>
                .
              </>
            ) : (
              'Use http://127.0.0.1 with a port, or an https:// address for another computer.'
            )
          }
        >
          <Input
            data-mask
            variant="code"
            aria-label="Machine URL"
            className="w-56"
            placeholder={MACHINE_URL}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </SettingsRow>
        <SettingsRow
          title="Allow it at the machine"
          description={
            isPending ? (
              <>
                Allow this browser on that computer only if it shows{' '}
                <InlineCode>{challenge.getUserCode(variables)}</InlineCode>.
              </>
            ) : (
              <>
                Connect asks the terminal running{' '}
                <InlineCode>tamery machine</InlineCode>, or the desktop app.
              </>
            )
          }
        >
          <Button type="submit" disabled={isPending || !origin}>
            <LoadingContent loading={isPending}>Connect</LoadingContent>
          </Button>
        </SettingsRow>
      </SettingsGroup>
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="wrap-anywhere">
            <FetchingReason reason={error.message} />
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}
