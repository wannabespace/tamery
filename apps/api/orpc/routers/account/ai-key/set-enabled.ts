import { type } from 'arktype'

import { aiKey } from '~/lib/ai-key'
import { accountMiddleware, orpc } from '~/orpc'

import { aiKeyProvider } from './provider'

export const setEnabled = orpc
  .use(accountMiddleware)
  .input(type({ enabled: 'boolean', provider: aiKeyProvider }))
  .handler(async ({ context, input }) => {
    await aiKey.setEnabled(context.user.id, input.provider, input.enabled)
  })
