import { CREDIT_TOP_UP } from '@tamery/shared/credits'
import { type } from 'arktype'

import { credits } from '~/lib/credits'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const setAutoTopUp = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.credits.buy'))
  .input(
    type({
      amount: type.number.atLeast(CREDIT_TOP_UP.min).atMost(CREDIT_TOP_UP.max),
      enabled: 'boolean',
      threshold: type.number.atLeast(0).atMost(CREDIT_TOP_UP.max),
    })
  )
  .handler(({ context, input }) => credits.setAutoTopUp(context.user.id, input))
