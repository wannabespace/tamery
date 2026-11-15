import { aiKey } from '~/lib/ai-key'
import { accountMiddleware, orpc } from '~/orpc'

export const remove = orpc
  .use(accountMiddleware)
  .handler(async ({ context }) => {
    await aiKey.remove(context.user.id)
  })
