import { credits } from '~/lib/credits'
import { accountMiddleware, orpc } from '~/orpc'

export const get = orpc
  .use(accountMiddleware)
  .handler(({ context }) => credits.get(context.user.id))
