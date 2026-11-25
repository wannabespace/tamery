import { orpc } from '~/lib/orpc'
import { queryClient } from '~/lib/query-client'

export const refreshAi = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.account.aiKey.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.ai.models.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.usage.key() }),
  ])
