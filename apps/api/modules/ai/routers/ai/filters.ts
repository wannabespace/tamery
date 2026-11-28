import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { generateFilters } from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { type } from 'arktype'

import { redis } from '~/lib/redis'
import { aiUsage } from '~/modules/billing/ai-usage'
import { usage } from '~/modules/billing/usage'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

const limiter = new RedisRateLimiter(redis, {
  maxRequests: 100,
  prefix: 'ai-filters:',
  window: 60 * 60 * 1000,
})

export const filters = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.filter.use'))
  .use(ratelimit({ key: ({ context }) => context.user.id, limiter }))
  .input(
    type({
      context: `string <= ${AI_QUERY_LIMITS.context}`,
      prompt: `string <= ${AI_QUERY_LIMITS.prompt}`,
    })
  )
  .handler(({ input, signal, context }) =>
    usage.metered(context, 'filters', async (skipCount) => {
      const result = await generateFilters({
        context: input.context,
        prompt: input.prompt,
        signal,
        telemetry: aiUsage.telemetry({
          feature: AiFeature.Filters,
          ownKey: false,
          userId: context.user.id,
        }),
      })
      if (
        result.filters.length === 0 &&
        Object.keys(result.orderBy).length === 0
      ) {
        skipCount()
      }
      return result
    })
  )
