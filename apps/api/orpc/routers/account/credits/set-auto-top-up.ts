import { CREDIT_TOP_UP } from '@tamery/shared/credits'
import { type } from 'arktype'

import { credits } from '~/lib/credits'
import { orpc, permissionsMiddleware } from '~/orpc'

const amount = type.number
  .divisibleBy(1)
  .atLeast(CREDIT_TOP_UP.min)
  .atMost(CREDIT_TOP_UP.max)

export const setAutoTopUp = orpc
  .use(permissionsMiddleware)
  .input(
    type({
      amount,
      enabled: 'boolean',
      threshold: type.number.divisibleBy(1).atLeast(0),
    }).narrow(
      ({ amount: topUp, threshold }, ctx) =>
        threshold < topUp || ctx.reject('a threshold under the amount')
    )
  )
  .errors({
    BAD_REQUEST: {
      message:
        'Auto top-up charges the card of your last top-up: add credits once first.',
    },
    FORBIDDEN: {
      message: 'Auto top-up needs a Pro plan; you can still turn it off.',
    },
  })
  // Turning it off needs no plan, so an account that lost Pro is never charged again.
  .handler(async ({ context, errors, input }) => {
    if (input.enabled && !context.permissions.check('ai.credits.buy')) {
      throw errors.FORBIDDEN()
    }
    if (!(await credits.setAutoTopUp(context.user.id, input))) {
      throw errors.BAD_REQUEST()
    }
  })
