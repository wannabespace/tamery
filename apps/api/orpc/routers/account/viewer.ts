import { pick } from '@tamery/shared/utils'

import { authMiddleware, orpc } from '~/orpc'

export const viewer = orpc
  .use(authMiddleware)
  .handler(({ context }) => pick(context.user, ['email', 'id', 'isAnonymous']))
