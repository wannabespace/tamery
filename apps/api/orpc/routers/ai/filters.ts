import { generateFilters } from '@tamery/ai/features'
import { AiFeature } from '@tamery/ai/usage'
import { AI_KEY_HINT } from '@tamery/shared/ai-key'
import { type } from 'arktype'

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
      message: `You have reached the free AI usage limit. Subscribe to Pro, ${AI_KEY_HINT}, to keep using AI features.`,
    },
  })
  .handler(async ({ input, signal, context, errors }) => {
    const { key, telemetry } = await usage.enforce(
      context,
      'filters',
      errors.TOO_MANY_REQUESTS
    )

    const result = await generateFilters({
      context: input.context,
      key,
      prompt: input.prompt,
      signal,
      telemetry: telemetry({
        feature: AiFeature.Filters,
        userId: context.user.id,
      }),
    })

    if (result.filters.length > 0 || Object.keys(result.orderBy).length > 0) {
      await usage.record(context, 'filters')
    }

    return result
  })
