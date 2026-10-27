import { generateFilters } from '@tamery/ai/features'
import { AiFeature } from '@tamery/ai/usage'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { usage } from '~/lib/usage'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const filters = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.filter.use'))
  .input(
    type({
      context: 'string',
      prompt: 'string',
    })
  )
  .errors({
    TOO_MANY_REQUESTS: {
      message:
        'You have reached the free AI usage limit. Please subscribe to a Pro plan to continue using AI features.',
    },
  })
  .handler(async ({ input, signal, context, errors }) => {
    context.addLogData({
      filterInput: input.prompt,
    })

    await usage.enforce(context, 'filters', errors.TOO_MANY_REQUESTS)

    const result = await generateFilters({
      context: input.context,
      prompt: input.prompt,
      signal,
      telemetry: aiUsage.telemetry({
        feature: AiFeature.Filters,
        userId: context.user.id,
      }),
    })

    if (result.filters.length > 0 || Object.keys(result.orderBy).length > 0) {
      await usage.record(context, 'filters')
    }

    context.addLogData({ filterResult: result })

    return result
  })
