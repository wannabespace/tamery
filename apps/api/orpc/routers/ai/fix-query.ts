import { fixQuery as runFixQuery } from '@tamery/ai/features'
import { AI_QUERY_LIMITS } from '@tamery/ai/limits'
import { AiFeature } from '@tamery/ai/usage'
import { AI_BUDGET_SPENT_MESSAGE } from '@tamery/shared/credits'
import { ConnectionType } from '@tamery/shared/enums/connection-type'
import { type } from 'arktype'

import { aiUsage } from '~/lib/ai-usage'
import { credits } from '~/lib/credits'
import { orpc, permissionsMiddleware, permix } from '~/orpc'

export const fixQuery = orpc
  .use(permissionsMiddleware)
  .use(permix.checkMiddleware('ai.query.use'))
  .input(
    type({
      context: `string <= ${AI_QUERY_LIMITS.context}`,
      editor: `string <= ${AI_QUERY_LIMITS.query}`,
      error: `string <= ${AI_QUERY_LIMITS.error}`,
      query: `string <= ${AI_QUERY_LIMITS.query}`,
      type: type.valueOf(ConnectionType),
    })
  )
  .errors({
    TOO_MANY_REQUESTS: { message: AI_BUDGET_SPENT_MESSAGE },
  })
  .handler(async ({ context, errors, input, signal }) => {
    if (!(await credits.canUseAi(context.user.id))) {
      throw errors.TOO_MANY_REQUESTS()
    }
    return runFixQuery({
      connectionType: input.type,
      context: input.context,
      editor: input.editor,
      error: input.error,
      signal,
      query: input.query,
      telemetry: aiUsage.telemetry({
        feature: AiFeature.FixQuery,
        ownKey: false,
        userId: context.user.id,
      }),
    })
  })
