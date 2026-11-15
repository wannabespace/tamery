import { completeQuery as runCompleteQuery } from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { AI_KEY_HINT } from '@tamery/shared/ai-key'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { usage } from '~/lib/usage'
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
  .errors({
    TOO_MANY_REQUESTS: {
      message: `Weekly AI autocomplete limit reached. Upgrade to Pro, ${AI_KEY_HINT}, for unlimited suggestions.`,
    },
  })
  .handler(async ({ context, errors, input, signal }) => {
    const { key } = await usage.enforce(
      context,
      'complete',
      errors.TOO_MANY_REQUESTS
    )
    const scope = { feature: AiFeature.CompleteQuery, userId: context.user.id }
    const result = await runCompleteQuery({
      connectionType: input.type,
      context: input.context,
      key,
      onUsage: async (modelId, modelUsage, providerCost) => {
        if (!key) {
          await aiUsage.record(scope, modelId, modelUsage, providerCost)
        }
      },
      prefix: input.prefix,
      signal,
      suffix: input.suffix,
    })
    await usage.record(context, 'complete')
    return result
  })
