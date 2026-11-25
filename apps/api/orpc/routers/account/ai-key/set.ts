import { verifyAiKey } from '@tamery/ai/models'
import { logProviderError } from '@tamery/ai/provider-error'
import { type } from 'arktype'

import { aiKey } from '~/lib/ai-key'
import { accountMiddleware, orpc } from '~/orpc'

import { aiKeyProvider } from './provider'

export const set = orpc
  .use(accountMiddleware)
  .input(
    type({
      key: type('string.trim').to('0 < string <= 500'),
      provider: aiKeyProvider,
    })
  )
  .errors({
    BAD_REQUEST: {
      message: 'The provider refused this key. Check it and try again.',
    },
  })
  .handler(async ({ context, errors, input }) => {
    await verifyAiKey(input).catch((error: unknown) => {
      logProviderError('ai key verification', error)
      throw errors.BAD_REQUEST()
    })
    await aiKey.set(context.user.id, input)
  })
