import {
  CHAT_EFFORTS,
  chatContexts,
  chatModelsFor,
  DEFAULT_CHAT_EFFORT,
} from '@tamery/ai/models'

import { aiPermissionsMiddleware, orpc } from '~/orpc'

export const models = orpc
  .use(aiPermissionsMiddleware)
  .handler(({ context }) => ({
    defaultEffort: DEFAULT_CHAT_EFFORT,
    efforts: CHAT_EFFORTS,
    models: chatModelsFor(context.aiKeys).map(({ id, name, provider }) => ({
      contexts: chatContexts(id),
      id,
      name,
      provider,
    })),
  }))
