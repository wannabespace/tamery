import { useLiveQuery } from '@tanstack/react-db'
import { useEffect } from 'react'

import { useCollections } from '~/core/collections'
import { useSubscription } from '~/core/user/use-subscription'
import { authClient } from '~/lib/auth'
import { getAppProperties, posthog } from '~/lib/posthog'

export const EventsProvider = ({ children }: { children: React.ReactNode }) => {
  const { data } = authClient.useSession()
  const { subscription } = useSubscription()
  const { connectionsCollection } = useCollections()
  const { data: connections } = useLiveQuery({
    query: (q) => q.from({ c: connectionsCollection }),
  })

  const userId = data?.user?.id
  const email = data?.user?.email
  const name = data?.user?.name
  const plan = subscription?.plan ?? 'free'
  const connectionsCount = connections.length

  useEffect(() => {
    if (userId) {
      posthog.identify(userId, {
        ...getAppProperties(),
        connections_count: connectionsCount,
        email,
        name,
        plan,
      })
    }
  }, [userId, email, name, plan, connectionsCount])

  return children
}
