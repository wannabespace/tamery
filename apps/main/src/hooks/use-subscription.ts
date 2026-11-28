import { ACTIVE_SUBSCRIPTION_STATUSES } from '@tamery/shared/constants'
import { useQuery } from '@tanstack/react-query'

import { authClient } from '~/lib/auth'
import { orpc } from '~/lib/orpc'

export const useSubscription = () => {
  const { data } = authClient.useSession()
  const isSignedIn = !!data?.user.id
  const { data: list } = useQuery(
    orpc.account.subscription.list.queryOptions({
      enabled: isSignedIn,
    })
  )

  if (!isSignedIn) {
    return null
  }

  return (
    list?.find((s) =>
      ACTIVE_SUBSCRIPTION_STATUSES.includes(
        s.status as (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number]
      )
    ) ?? null
  )
}
