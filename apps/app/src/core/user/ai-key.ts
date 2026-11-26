import { useQuery } from '@tanstack/react-query'
import { type } from 'arktype'
import { createWebStorageValue } from 'seitu/web'

import { useHasAccount } from '~/lib/auth'
import { orpc } from '~/lib/orpc'

/** The dictation model picked on this device for the connected keys; the API takes the default for one their providers do not offer. */
export const dictationModelValue = createWebStorageValue({
  defaultValue: null,
  key: 'dictation-model',
  schema: type('string | null'),
  type: 'localStorage',
})

export const aiKeysQueryOptions = orpc.account.aiKey.list.queryOptions()

export const useAiKeys = () => {
  const hasAccount = useHasAccount()
  const { data, isLoading } = useQuery({
    ...aiKeysQueryOptions,
    enabled: hasAccount,
  })
  return { aiKeys: data ?? [], isLoading }
}
