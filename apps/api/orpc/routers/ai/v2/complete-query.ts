import { ORPCError } from '@orpc/server'
import { completeQuery as runCompleteQuery } from '@tamery/ai/features'
import { AI_QUERY_LIMITS, COMPLETE_QUERY_WEEKLY_LIMIT } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage, weeklyUsageCount } from '~/lib/ai-usage'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const completeQuery = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.query.complete'))
  .use(async ({ context, next }) => {
    if (
      !context.subscription &&
      (await weeklyUsageCount(context.user.id, AiFeature.CompleteQuery)) >=
        COMPLETE_QUERY_WEEKLY_LIMIT
    ) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message:
          'Weekly AI autocomplete limit reached. Upgrade to Pro for unlimited suggestions.',
      })
    }
    return next()
  })
  .input(
    type({
      context: `string <= ${AI_QUERY_LIMITS.context}`,
      prefix: `string <= ${AI_QUERY_LIMITS.query}`,
      suffix: `string <= ${AI_QUERY_LIMITS.query}`,
      type: type.valueOf(ConnectionType),
    })
  )
  .handler(({ context, input, signal }) => {
    const scope = { feature: AiFeature.CompleteQuery, userId: context.user.id }
    return runCompleteQuery({
      connectionType: input.type,
      context: input.context,
      onUsage: (modelId, usage) => aiUsage.record(scope, modelId, usage),
      prefix: input.prefix,
      signal,
      suffix: input.suffix,
    })
  })
