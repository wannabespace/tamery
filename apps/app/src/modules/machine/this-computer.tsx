import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { Switch } from '@tamery/ui/components/switch'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { thisMachineQuery } from '~/core/runtime/machine/pairing'
import { bearerToken, getSessionUser } from '~/lib/auth'
import { queryClient } from '~/lib/query-client'

type Status = Awaited<
  ReturnType<NonNullable<Window['electron']>['machine']['status']>
>

const setStatus = (status: Status) =>
  queryClient.setQueryData(thisMachineQuery.queryKey, status)

/** Desktop only: this computer as a machine your other devices run connections on. */
export const ThisComputer = () => {
  const { data: status } = useQuery(thisMachineQuery)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const share = useMutation({
    meta: { event: 'machine_shared' },
    mutationFn: async () => {
      const [user, token] = [await getSessionUser(), bearerToken.get()]
      if (!user || !token) {
        throw new Error('Sign in to let other devices use this computer.')
      }
      return window.electron?.machine.enable({
        account: { email: user.email, id: user.id, token },
        publicUrl: (publicUrl ?? status?.publicUrl)?.trim() || null,
      })
    },
    onSuccess: (next) => next && setStatus(next),
  })
  const unshare = useMutation({
    meta: { event: 'machine_unshared' },
    mutationFn: () =>
      window.electron?.machine.disable() ?? Promise.resolve(null),
    onSuccess: (next) => next && setStatus(next),
  })
  const error = share.error ?? unshare.error

  if (!status) {
    return null
  }

  let description =
    'Your browsers and other computers run connections here once you allow each one, while Tamery runs.'
  if (status.status === 'starting') {
    description = 'Starting…'
  } else if (status.status === 'on') {
    description = `Listening at ${status.url}.${status.registerError ? ` Not listed in your account: ${status.registerError}` : ''}`
  }

  return (
    <>
      <SettingsGroup title="This computer">
        <SettingsRow
          htmlFor="machine-shared"
          title="Let your other devices use this computer"
          description={description}
        >
          <Switch
            id="machine-shared"
            size="sm"
            checked={status.enabled}
            disabled={share.isPending || unshare.isPending}
            onCheckedChange={(enabled) =>
              enabled ? share.mutate() : unshare.mutate()
            }
          />
        </SettingsRow>
        <SettingsRow
          title="Address for other computers"
          description="An https:// address a tunnel on this computer serves, such as Tailscale Serve. Browsers on this computer need none."
        >
          <Input
            data-mask
            variant="code"
            aria-label="Address for other computers"
            className="w-56"
            placeholder="https://"
            value={publicUrl ?? status.publicUrl ?? ''}
            onChange={(event) => setPublicUrl(event.target.value)}
            onBlur={() => {
              if (
                status.enabled &&
                publicUrl !== null &&
                publicUrl !== status.publicUrl
              ) {
                share.mutate()
              }
            }}
          />
        </SettingsRow>
      </SettingsGroup>
      {(error || status.status === 'failed') && (
        <Alert variant="destructive">
          <AlertDescription className="wrap-break-word">
            {error?.message ?? (status.status === 'failed' && status.message)}
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
