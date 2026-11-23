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

import { FetchingReason } from '~/core/connection/fetching-reason'
import { parseMachineUrl } from '~/core/runtime/machine/client'
import { machine } from '~/core/runtime/machine/machine'

export const PairForm = ({
  link,
  replaces,
}: {
  link: string | null
  replaces: string | null
}) => {
  const [url, setUrl] = useState(link ?? '')
  const target = url.trim() || MACHINE_URL
  const origin = parseMachineUrl(target)
  const { error, isPending, mutate, variables } = useMutation({
    mutationFn: (browserNonce: string) =>
      machine.pair({
        browserNonce,
        url: target,
        via: link === null ? 'manual' : 'link',
      }),
    onSuccess: (pairing) => toast.success(`Connected to ${pairing.name}`),
  })

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        mutate(machineKey.nonce())
      }}
    >
      <SettingsGroup title="Connect this browser">
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
            <>
              {isPending ? (
                <>
                  Allow this browser in the terminal running{' '}
                  <InlineCode>tamery machine</InlineCode> only if it shows{' '}
                  <InlineCode>{challenge.getUserCode(variables)}</InlineCode>.
                </>
              ) : (
                <>
                  Connect asks the terminal running{' '}
                  <InlineCode>tamery machine</InlineCode>, or{' '}
                  <InlineCode>tamery machine approve</InlineCode>.
                </>
              )}
              {replaces && (
                <>
                  {' '}
                  Replaces <span data-mask>{replaces}</span>.
                </>
              )}
            </>
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
