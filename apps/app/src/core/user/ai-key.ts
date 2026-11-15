import { useQuery } from '@tanstack/react-query'

import { useHasAccount } from '~/lib/auth'
import { orpc } from '~/lib/orpc'

export const aiKeyQueryOptions = orpc.account.aiKey.get.queryOptions()

export const useAiKey = () => {
  const hasAccount = useHasAccount()
  const { data, isLoading } = useQuery({
    ...aiKeyQueryOptions,
    enabled: hasAccount,
  })
  return { aiKey: data ?? null, isLoading }
}
