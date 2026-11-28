import { completeQuery as runCompleteQuery } from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage } from '~/modules/billing/ai-usage'
import { usage } from '~/modules/billing/usage'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const completeQuery = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.query.complete'))
  .input(
    type({
      context: `string <= ${AI_QUERY_LIMITS.context}`,
      prefix: `string <= ${AI_QUERY_LIMITS.query}`,
      suffix: `string <= ${AI_QUERY_LIMITS.query}`,
      type: type.valueOf(ConnectionType),
    })
  )
  .handler(({ context, input, signal }) => {
    const scope = {
      feature: AiFeature.CompleteQuery,
      ownKey: false,
      userId: context.user.id,
    }
    return usage.metered(context, 'complete', () =>
      runCompleteQuery({
        connectionType: input.type,
        context: input.context,
        onUsage: (modelId, modelUsage, providerCost) =>
          aiUsage.record(scope, modelId, modelUsage, providerCost),
        prefix: input.prefix,
        signal,
        suffix: input.suffix,
      })
    )
  })
