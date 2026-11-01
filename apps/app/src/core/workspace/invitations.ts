import { useQuery } from '@tanstack/react-query'
import { createStore } from 'seitu'

import { useIsAnonymous } from '~/lib/auth'
import { orpc } from '~/lib/orpc'

export const openedInvitationId = createStore<string | null>(null)

export const useInvitations = () => {
  const isAnonymous = useIsAnonymous()
  const { data = [] } = useQuery(
    orpc.workspaces.invitations.queryOptions({ enabled: !isAnonymous })
  )

  return data
}
