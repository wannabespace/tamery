import { formatDeviceLabel } from '@tamery/shared/device-label'
import { Badge } from '@tamery/ui/components/badge'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { orpc } from '~/lib/orpc'

import { ConfirmAction } from './confirm-action'

export const SessionItem = ({
  id,
  userAgent,
  ipAddress,
  current,
  refetchSessions,
}: {
  id: string
  userAgent: string | null
  ipAddress: string | null
  current: boolean
  refetchSessions: () => void
}) => {
  const { mutate: revokeSession, isPending: revokingSession } = useMutation(
    orpc.account.revokeSession.mutationOptions({
      meta: { event: 'session_revoked' },
      onSuccess: () => {
        refetchSessions()
        toast.success('Session revoked')
      },
    })
  )

  return (
    <SettingsRow
      title={
        <span className="flex items-center gap-2">
          {userAgent ? formatDeviceLabel(userAgent) : 'Unknown device'}
          {current && <Badge variant="secondary">This device</Badge>}
        </span>
      }
      description={ipAddress && <span data-mask>{ipAddress}</span>}
    >
      {!current && (
        <ConfirmAction
          action="Revoke"
          title="Revoke this session?"
          description="The device is signed out right away."
          isPending={revokingSession}
          onConfirm={(close) => revokeSession({ id }, { onSuccess: close })}
        />
      )}
    </SettingsRow>
  )
}
