import { BRIDGE_URL } from '@tamery/shared/bridge'
import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import { Button } from '@tamery/ui/components/button'
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
import { bridge } from '~/core/runtime/bridge/bridge'
import { parseBridgeUrl } from '~/core/runtime/bridge/client'
import type { PairingLink } from '~/lib/pairing-link'

/** Opening a pairing link only fills this in: pressing Pair is the consent, and the first request the bridge sees. */
export const PairForm = ({
  link,
  replaces,
}: {
  link: PairingLink | null
  replaces: string | null
}) => {
  const [url, setUrl] = useState(link?.url ?? BRIDGE_URL)
  const [code, setCode] = useState(link?.code ?? '')
  const origin = parseBridgeUrl(url)
  const { error, isPending, mutate } = useMutation({
    mutationFn: () => bridge.pair({ code, url, via: link ? 'link' : 'manual' }),
    onSuccess: (pairing) => toast.success(`Paired with ${pairing.name}`),
  })

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        mutate()
      }}
    >
      <SettingsGroup title="Pair this browser">
        <SettingsRow
          title="Bridge URL"
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
              'Another computer needs an https:// address.'
            )
          }
        >
          <Input
            data-mask
            variant="code"
            aria-label="Bridge URL"
            className="w-56"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </SettingsRow>
        <SettingsRow
          title="Pairing code"
          description={
            <>
              Printed by{' '}
              <code className="text-foreground font-mono text-xs">
                tamery bridge
              </code>
              , valid for 10 minutes.
              {replaces && (
                <>
                  {' '}
                  Replaces <span data-mask>{replaces}</span>.
                </>
              )}
            </>
          }
        >
          <Input
            data-mask
            variant="code"
            aria-label="Pairing code"
            autoComplete="off"
            className="w-40"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Button type="submit" disabled={isPending || !origin || !code.trim()}>
            <LoadingContent loading={isPending}>Pair</LoadingContent>
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
