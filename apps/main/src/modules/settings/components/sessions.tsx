import {
  SettingsGroup,
  SettingsRow,
} from '@tamery/ui/components/custom/settings-group'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { authClient } from '~/lib/auth'
import { orpc } from '~/lib/orpc'
import { handleError } from '~/utils/error'

import { ConfirmAction } from './confirm-action'
import { SessionItem } from './session-item'

export const SessionsSettings = () => {
  const { data: sessions, refetch: refetchSessions } = useSuspenseQuery(
    orpc.account.sessions.queryOptions()
  )

  const { mutate: revokeOtherSessions, isPending: revokingOthers } =
    useMutation({
      meta: { event: 'other_sessions_revoked' },
      mutationFn: async () => {
        const { error } = await authClient.revokeOtherSessions()

        if (error) {
          throw error
        }
      },
      onError: handleError,
      onSuccess: () => {
        refetchSessions()
        toast.success('All other sessions have been revoked')
      },
    })

  return (
    <SettingsGroup title="Sessions">
      {sessions.map((session) => (
        <SessionItem
          key={session.id}
          {...session}
          refetchSessions={refetchSessions}
        />
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
            isPending={revokingOthers}
            onConfirm={(close) =>
              revokeOtherSessions(undefined, { onSuccess: close })
            }
          />
        </SettingsRow>
      )}
    </SettingsGroup>
  )
}
