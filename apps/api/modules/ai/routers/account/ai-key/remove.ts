import { type } from 'arktype'

import { aiKey } from '~/modules/ai/ai-key'
import { accountMiddleware, orpc } from '~/orpc'

import { aiKeyProvider } from './provider'

export const remove = orpc
  .use(accountMiddleware)
  .input(type({ provider: aiKeyProvider }))
  .handler(async ({ context, input }) => {
    await aiKey.remove(context.user.id, input.provider)
  })
