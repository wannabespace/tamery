import { useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { createWebStorageValue } from 'seitu/web'

import { useHasAccount } from '~/lib/auth'
import { orpc } from '~/lib/orpc'

/** The dictation model picked on this device for the saved key; the API takes its provider's default for one it does not offer. */
export const dictationModelValue = createWebStorageValue({
  defaultValue: null,
  key: 'dictation-model',
  schema: type('string | null'),
  type: 'localStorage',
})

export const aiKeyQueryOptions = orpc.account.aiKey.get.queryOptions()

export const useAiKey = () => {
  const hasAccount = useHasAccount()
  const { data, isLoading } = useQuery({
    ...aiKeyQueryOptions,
    enabled: hasAccount,
  })
  return { aiKey: data ?? null, isLoading }
}
