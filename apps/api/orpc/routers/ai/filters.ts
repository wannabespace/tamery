import { ratelimit } from '@orpc/ratelimit'
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { generateFilters } from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { redis } from '~/lib/redis'
import { usage } from '~/lib/usage'
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
  .errors({
    TOO_MANY_REQUESTS: {
      message:
        'You have reached the free AI usage limit. Please subscribe to a Pro plan to continue using AI features.',
    },
  })
  .handler(({ input, signal, context, errors }) =>
    usage.metered(
      context,
      'filters',
      errors.TOO_MANY_REQUESTS,
      () =>
        generateFilters({
          context: input.context,
          prompt: input.prompt,
          signal,
          telemetry: aiUsage.telemetry({
            feature: AiFeature.Filters,
            userId: context.user.id,
          }),
        }),
      (result) =>
        result.filters.length > 0 || Object.keys(result.orderBy).length > 0
    )
  )
