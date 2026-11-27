import { credits } from '~/modules/billing/credits'
import { accountMiddleware, orpc } from '~/orpc'

export const get = orpc
  .use(accountMiddleware)
  .handler(({ context }) => credits.get(context.user.id))
