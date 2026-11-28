import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { handleError } from '~/utils/error'

import { ConfirmAction } from './confirm-action'
import { SessionRow } from './session-row'

export const Sessions = () => {
  const { data: sessions, refetch } = useQuery(
    orpc.account.sessions.queryOptions()
  )
  const { mutate: revokeOthers, isPending } = useMutation({
    meta: { event: 'other_sessions_revoked' },
    mutationFn: () =>
      authClient.revokeOtherSessions({ fetchOptions: { throw: true } }),
    onError: (error) => handleError(error),
    onSuccess: () => {
      void refetch()
      toast.success('All other sessions have been revoked')
    },
  })

  if (!sessions) {
    return null
  }

  return (
    <SettingsGroup title="Sessions">
      {sessions.map((session) => (
        <SessionRow key={session.id} {...session} onRevoked={refetch} />
      ))}
      {sessions.some((session) => !session.current) && (
        <SettingsRow
          title="Sign out other devices"
          description="Every session except this one ends right away."
        >
          <ConfirmAction
            action="Revoke all"
            title="Revoke all other sessions?"
            description="Every device except this one is signed out right away."
            isPending={isPending}
            onConfirm={(close) => revokeOthers(undefined, { onSuccess: close })}
          />
        </SettingsRow>
      )}
    </SettingsGroup>
  )
}
