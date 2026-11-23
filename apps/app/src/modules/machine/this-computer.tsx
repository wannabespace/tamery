import { Alert, AlertDescription } from '@tamery/ui/components/alert'
import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { Input } from '@tamery/ui/components/input'
import { Switch } from '@tamery/ui/components/switch'
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { thisMachineId } from '~/core/runtime/machine/pairing'
import { bearerToken, getSessionUser } from '~/lib/auth'
import { posthog } from '~/lib/posthog'
import { queryClient } from '~/lib/query-client'

/** While starting, the status settles within a second or two. */
const STARTING_POLL_MS = 1000

const statusQuery = queryOptions({
  queryFn: async () => {
    const status = await window.electron?.machine.status()
    if (status?.status === 'on') {
      thisMachineId.set(status.id)
    }
    return status ?? null
  },
  queryKey: ['this-machine'],
  refetchInterval: ({ state: { data } }) =>
    data?.status === 'starting' ? STARTING_POLL_MS : false,
})

/** Desktop only: this computer as a machine your other devices run connections on. */
export const ThisComputer = () => {
  const { data: status } = useQuery(statusQuery)
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const share = useMutation({
    mutationFn: async (enabled: boolean) => {
      const machine = window.electron?.machine
      if (!machine) {
        return null
      }
      if (!enabled) {
        return machine.disable()
      }
      const [user, token] = [await getSessionUser(), bearerToken.get()]
      if (!user || !token) {
        throw new Error('Sign in to let other devices use this computer.')
      }
      return machine.enable({
        account: { email: user.email, id: user.id, token },
        publicUrl: (publicUrl ?? status?.publicUrl)?.trim() || null,
      })
    },
    onSuccess: (next, enabled) => {
      queryClient.setQueryData(statusQuery.queryKey, next)
      posthog.capture('machine_shared', { enabled })
    },
  })

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
            disabled={share.isPending}
            onCheckedChange={(enabled) => share.mutate(enabled)}
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
                share.mutate(true)
              }
            }}
          />
        </SettingsRow>
      </SettingsGroup>
      {(share.error || status.status === 'failed') && (
        <Alert variant="destructive">
          <AlertDescription className="wrap-break-word">
            {share.error?.message ??
              (status.status === 'failed' && status.message)}
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
