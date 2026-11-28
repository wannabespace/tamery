import { formatDeviceLabel } from '@tamery/shared/device-label'
import { Badge } from '@tamery/ui/components/badge'
import { SettingsRow } from '@tamery/ui/components/custom/settings-group'
import { useMutation } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

import { orpc } from '~/lib/orpc'

import { ConfirmAction } from './confirm-action'

export const SessionRow = ({
  current,
  id,
  ipAddress,
  lastActiveAt,
  onRevoked,
  userAgent,
}: {
  current: boolean
  id: string
  ipAddress: string | null
  lastActiveAt: Date
  onRevoked: () => void
  userAgent: string | null
}) => {
  const { mutate: revoke, isPending } = useMutation(
    orpc.account.revokeSession.mutationOptions({
      meta: { event: 'session_revoked' },
      onSuccess: () => {
        onRevoked()
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
      description={
        <>
          {current
            ? 'Active now'
            : `Active ${formatDistanceToNow(lastActiveAt, { addSuffix: true })}`}
          {ipAddress && <span data-mask> · {ipAddress}</span>}
        </>
      }
    >
      {!current && (
        <ConfirmAction
          action="Revoke"
          title="Revoke this session?"
          description="The device is signed out right away."
          isPending={isPending}
          onConfirm={(close) => revoke({ id }, { onSuccess: close })}
        />
      )}
    </SettingsRow>
  )
}
