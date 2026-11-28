import { accountMiddleware, orpc } from '~/orpc'

import { credits } from '../../../credits'

export const get = orpc
  .use(accountMiddleware)
  .handler(({ context }) => credits.get(context.user.id))
