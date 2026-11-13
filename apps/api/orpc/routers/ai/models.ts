import {
  CHAT_EFFORTS,
  chatContexts,
  chatModels,
  DEFAULT_CHAT_EFFORT,
  DEFAULT_CHAT_MODEL,
} from '@tamery/ai/models'

import { orpc, permissionsMiddleware } from '~/orpc'

export const models = orpc.use(permissionsMiddleware).handler(() => ({
  defaultEffort: DEFAULT_CHAT_EFFORT,
  defaultId: DEFAULT_CHAT_MODEL,
  efforts: CHAT_EFFORTS,
  models: chatModels.map(({ id, name, provider, ...model }) => ({
    contexts: chatContexts(id),
    featured: 'featured' in model,
    id,
    name,
    provider,
  })),
}))
