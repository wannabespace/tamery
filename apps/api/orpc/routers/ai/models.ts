import {
  CHAT_EFFORTS,
  chatContexts,
  chatModelsFor,
  DEFAULT_CHAT_EFFORT,
} from '@tamery/ai/models'

import { aiKey } from '~/lib/ai-key'
import { orpc, permissionsMiddleware } from '~/orpc'

export const models = orpc
  .use(permissionsMiddleware)
  .handler(async ({ context }) => ({
    defaultEffort: DEFAULT_CHAT_EFFORT,
    efforts: CHAT_EFFORTS,
    models: chatModelsFor(await aiKey.get(context.user.id)).map(
      ({ id, name, provider }) => ({
        contexts: chatContexts(id),
        id,
        name,
        provider,
      })
    ),
  }))
