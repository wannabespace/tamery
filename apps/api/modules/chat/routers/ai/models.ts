import { chatModelsFor, chatModelVariations } from '@tamery/ai/models'

import { aiPermissionsMiddleware, orpc } from '~/orpc'

export const models = orpc
  .use(aiPermissionsMiddleware)
  .handler(({ context }) => ({
    models: chatModelsFor(context.aiKeys).map(({ id, name, provider }) => ({
      ...chatModelVariations(id),
      id,
      name,
      provider,
    })),
  }))
